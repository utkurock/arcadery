import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { startRefine, waitForTask } from '@/lib/ai/meshy';
import { replaceGlbAsset } from '@/lib/ai/model-store';
import { spendCredits, grantCredits, InsufficientCreditsError } from '@/lib/credits/server';
import { INSUFFICIENT_CREDITS_STATUS, MODEL_REFINE_COST } from '@/lib/credits/config';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 300; // refine is heavier than preview (textured PBR pass)

type Body = { assetId?: string; texturePrompt?: string };

type ModelMeta = {
  mode?: string;
  provider?: string;
  meshy_task_id?: string;
  refined?: boolean;
  thumbnail_url?: string;
};

type AssetRow = {
  id: string;
  user_id: string;
  project_id: string;
  storage_path: string;
  type: string;
  frame_metadata: ModelMeta | null;
};

/**
 * POST /api/ai/model/refine
 * Upgrades a Meshy preview model (already stored as an asset) to a textured
 * PBR model in place. Requires the asset's preview Meshy task id.
 */
export async function POST(request: Request) {
  const rl = checkRateLimit('ai:model:refine', clientIp(request), 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many refine requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to refine models', code: 'auth_required' },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const assetId = body?.assetId?.trim();
  if (!assetId) {
    return NextResponse.json({ error: 'Missing assetId' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: asset } = await admin
    .from('assets')
    .select('id, user_id, project_id, storage_path, type, frame_metadata')
    .eq('id', assetId)
    .maybeSingle<AssetRow>();
  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  if (asset.user_id !== user.id) {
    return NextResponse.json({ error: 'Not your asset' }, { status: 403 });
  }
  const previewTaskId = asset.frame_metadata?.meshy_task_id;
  if (asset.type !== 'model/gltf-binary' || !previewTaskId) {
    return NextResponse.json(
      { error: 'This asset is not a Meshy-generated model that can be refined' },
      { status: 400 },
    );
  }
  if (asset.frame_metadata?.refined) {
    return NextResponse.json({ error: 'This model is already refined' }, { status: 409 });
  }

  const cost = MODEL_REFINE_COST;
  try {
    await spendCredits({
      userId: user.id,
      amount: cost,
      reason: 'ai_image',
      metadata: { kind: 'model_refine', assetId },
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
      metadata: { operation: 'ai_model_refine', cause },
    }).catch(() => {});
  }

  let refineTaskId: string;
  try {
    refineTaskId = await startRefine(previewTaskId, { enablePbr: true, texturePrompt: body?.texturePrompt });
  } catch (err) {
    await refund('meshy_start');
    const msg = err instanceof Error ? err.message : 'Meshy refine start failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const task = await waitForTask(refineTaskId, { timeoutMs: 240_000 });
  if (task.status !== 'SUCCEEDED') {
    if (task.status === 'FAILED' || task.status === 'EXPIRED') {
      await refund(`meshy_${task.status.toLowerCase()}`);
      return NextResponse.json({ error: task.error?.message ?? 'Refine failed' }, { status: 502 });
    }
    // Still running past our budget — credit stays spent; client can re-poll
    // the asset later. Surface as pending so the UI can show progress.
    return NextResponse.json({ pending: true, taskId: refineTaskId, progress: task.progress });
  }

  const glbUrl = task.model_urls?.glb;
  if (!glbUrl) {
    await refund('no_glb');
    return NextResponse.json({ error: 'Meshy did not return a refined GLB' }, { status: 502 });
  }

  try {
    const updated = await replaceGlbAsset({
      admin,
      asset: {
        id: asset.id,
        user_id: asset.user_id,
        storage_path: asset.storage_path,
        frame_metadata: asset.frame_metadata,
      },
      glbUrl,
      frameMetadataPatch: {
        refined: true,
        refine_task_id: refineTaskId,
        thumbnail_url: task.thumbnail_url ?? asset.frame_metadata?.thumbnail_url,
      },
    });
    return NextResponse.json({ asset: updated });
  } catch (err) {
    await refund(err instanceof Error ? err.message : 'persist_failed');
    return NextResponse.json({ error: 'Failed to save refined model' }, { status: 500 });
  }
}
