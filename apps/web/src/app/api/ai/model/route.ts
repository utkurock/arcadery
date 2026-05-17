import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  startTextToModel,
  waitForTask,
  downloadGlb,
} from '@/lib/ai/meshy';
import {
  spendCredits,
  grantCredits,
  InsufficientCreditsError,
} from '@/lib/credits/server';
import { INSUFFICIENT_CREDITS_STATUS } from '@/lib/credits/config';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — Meshy preview takes 30-90s typically

const MODEL_PREVIEW_COST = 15;

type Body = {
  projectId?: string;
  prompt?: string;
  artStyle?: 'realistic' | 'sculpture' | 'cartoon' | 'low-poly';
  /** When true, after preview succeeds we kick off refine + rigging. Costs more. */
  refine?: boolean;
};

/**
 * POST /api/ai/model
 * Generates a 3D model via Meshy text-to-3D, downloads the GLB, uploads to
 * Supabase storage, and inserts an asset row of type "model/gltf-binary".
 *
 * NOTE: Refine + rigging not yet wired — preview only in v1. Async polling on
 * client is supported via task_id when generation exceeds the function budget.
 */
export async function POST(request: Request) {
  // Meshy is the most expensive AI call we make — keep this very tight.
  const rl = checkRateLimit('ai:model', clientIp(request), 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many model requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to generate models', code: 'auth_required' },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const projectId = body?.projectId?.trim();
  const prompt = body?.prompt?.trim();
  if (!projectId || !prompt) {
    return NextResponse.json({ error: 'Missing projectId or prompt' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: project } = await admin
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .maybeSingle<{ id: string; user_id: string }>();
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (project.user_id !== user.id) {
    return NextResponse.json({ error: 'Not your project' }, { status: 403 });
  }

  const cost = MODEL_PREVIEW_COST;
  try {
    await spendCredits({
      userId: user.id,
      amount: cost,
      reason: 'ai_image',
      metadata: { kind: 'model_preview', projectId },
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: 'Not enough credits.', code: 'insufficient_credits', cost },
        { status: INSUFFICIENT_CREDITS_STATUS },
      );
    }
    return NextResponse.json({ error: 'Credit system error' }, { status: 500 });
  }

  async function refund(cause: string) {
    await grantCredits({
      userId: user!.id,
      amount: cost,
      reason: 'refund',
      metadata: { operation: 'ai_model', cause },
    }).catch(() => {});
  }

  let taskId: string;
  try {
    taskId = await startTextToModel({
      prompt,
      artStyle: body?.artStyle ?? 'cartoon',
      mode: 'preview',
    });
  } catch (err) {
    await refund('meshy_start');
    const msg = err instanceof Error ? err.message : 'Meshy start failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const task = await waitForTask(taskId);

  if (task.status !== 'SUCCEEDED') {
    if (task.status === 'FAILED' || task.status === 'EXPIRED') {
      await refund(`meshy_${task.status.toLowerCase()}`);
      return NextResponse.json(
        { error: task.error?.message ?? 'Generation failed' },
        { status: 502 },
      );
    }
    // Still in progress — return the task id; client should poll /api/ai/model/poll
    return NextResponse.json({ pending: true, taskId, progress: task.progress });
  }

  const glbUrl = task.model_urls?.glb;
  if (!glbUrl) {
    await refund('no_glb');
    return NextResponse.json({ error: 'Meshy did not return a GLB' }, { status: 502 });
  }

  let glbBuffer: Buffer;
  try {
    glbBuffer = await downloadGlb(glbUrl);
  } catch (err) {
    await refund('glb_download');
    const msg = err instanceof Error ? err.message : 'GLB download failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.glb`;
  const { error: uploadErr } = await admin.storage
    .from('assets')
    .upload(path, glbBuffer, {
      contentType: 'model/gltf-binary',
      cacheControl: '31536000',
      upsert: false,
    });
  if (uploadErr) {
    await refund('storage_upload');
    return NextResponse.json({ error: 'Failed to save model' }, { status: 500 });
  }
  const publicUrl = admin.storage.from('assets').getPublicUrl(path).data.publicUrl;

  const { data: asset, error: insertErr } = await admin
    .from('assets')
    .insert({
      user_id: user.id,
      project_id: projectId,
      name: prompt.slice(0, 48) + '.glb',
      url: publicUrl,
      type: 'model/gltf-binary',
      size: glbBuffer.byteLength,
      storage_path: path,
      frame_metadata: {
        mode: 'model',
        provider: 'meshy',
        meshy_task_id: taskId,
        thumbnail_url: task.thumbnail_url,
      },
    })
    .select()
    .single();

  if (insertErr || !asset) {
    await admin.storage.from('assets').remove([path]).catch(() => {});
    await refund('db_insert');
    return NextResponse.json({ error: 'Failed to record asset' }, { status: 500 });
  }

  return NextResponse.json({ asset });
}
