import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { startRigging, waitForRiggingTask } from '@/lib/ai/meshy';
import { saveGlbAsset } from '@/lib/ai/model-store';
import { spendCredits, grantCredits, InsufficientCreditsError } from '@/lib/credits/server';
import { INSUFFICIENT_CREDITS_STATUS, MODEL_RIG_COST } from '@/lib/credits/config';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 300; // rigging + animation generation is the slowest Meshy step

type Body = { assetId?: string; heightMeters?: number };

type ModelMeta = {
  provider?: string;
  meshy_task_id?: string;
  refined?: boolean;
  rigged?: boolean;
  thumbnail_url?: string;
};

type AssetRow = {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  url: string;
  type: string;
  frame_metadata: ModelMeta | null;
};

/**
 * POST /api/ai/model/rig
 * Rigs a Meshy model (humanoid skeleton + walking/running animations) and
 * saves the rigged result as a NEW asset (the source model is preserved).
 */
export async function POST(request: Request) {
  const rl = checkRateLimit('ai:model:rig', clientIp(request), 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many rigging requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to rig models', code: 'auth_required' },
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
    .select('id, user_id, project_id, name, url, type, frame_metadata')
    .eq('id', assetId)
    .maybeSingle<AssetRow>();
  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  if (asset.user_id !== user.id) {
    return NextResponse.json({ error: 'Not your asset' }, { status: 403 });
  }
  if (asset.type !== 'model/gltf-binary') {
    return NextResponse.json({ error: 'Only 3D models can be rigged' }, { status: 400 });
  }
  if (asset.frame_metadata?.rigged) {
    return NextResponse.json({ error: 'This model is already rigged' }, { status: 409 });
  }

  const cost = MODEL_RIG_COST;
  try {
    await spendCredits({
      userId: user.id,
      amount: cost,
      reason: 'ai_image',
      metadata: { kind: 'model_rig', assetId },
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
      metadata: { operation: 'ai_model_rig', cause },
    }).catch(() => {});
  }

  let rigTaskId: string;
  try {
    // Prefer the source Meshy task when present; otherwise rig the public GLB.
    rigTaskId = await startRigging({
      inputTaskId: asset.frame_metadata?.meshy_task_id,
      modelUrl: asset.frame_metadata?.meshy_task_id ? undefined : asset.url,
      heightMeters: body?.heightMeters,
    });
  } catch (err) {
    await refund('meshy_start');
    const msg = err instanceof Error ? err.message : 'Meshy rigging start failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const task = await waitForRiggingTask(rigTaskId, { timeoutMs: 260_000 });
  if (task.status !== 'SUCCEEDED') {
    if (task.status === 'FAILED' || task.status === 'EXPIRED') {
      await refund(`meshy_${task.status.toLowerCase()}`);
      return NextResponse.json({ error: task.error?.message ?? 'Rigging failed' }, { status: 502 });
    }
    return NextResponse.json({ pending: true, taskId: rigTaskId, progress: task.progress });
  }

  const riggedGlb = task.result?.rigged_character_glb_url;
  if (!riggedGlb) {
    await refund('no_rigged_glb');
    return NextResponse.json({ error: 'Meshy did not return a rigged GLB' }, { status: 502 });
  }

  const anims = task.result?.basic_animations ?? {};
  const animationUrls = {
    walking: anims.walking_glb_url ?? null,
    running: anims.running_glb_url ?? null,
  };

  try {
    const rigged = await saveGlbAsset({
      admin,
      userId: user.id,
      projectId: asset.project_id,
      name: `${asset.name.replace(/\.glb$/i, '')} (rigged).glb`,
      glbUrl: riggedGlb,
      frameMetadata: {
        mode: 'model',
        provider: 'meshy',
        rigged: true,
        source_asset_id: asset.id,
        rig_task_id: rigTaskId,
        animations: animationUrls,
      },
    });
    return NextResponse.json({ asset: rigged });
  } catch (err) {
    await refund(err instanceof Error ? err.message : 'persist_failed');
    return NextResponse.json({ error: 'Failed to save rigged model' }, { status: 500 });
  }
}
