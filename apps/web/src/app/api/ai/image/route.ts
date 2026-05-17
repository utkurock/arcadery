import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  generateImage,
  STYLE_SUFFIXES,
  type ImageStyle,
  type ImageSize,
  type ImageMode,
} from '@/lib/ai/image';
import { sliceSheet, SHEET_VIEW_NAMES } from '@/lib/ai/slice';
import {
  spendCredits,
  grantCredits,
  InsufficientCreditsError,
} from '@/lib/credits/server';
import {
  AI_IMAGE_COST,
  AI_SPRITE_SHEET_COST,
  AI_ANIMATION_COST,
  INSUFFICIENT_CREDITS_STATUS,
} from '@/lib/credits/config';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 90;

const VALID_STYLES = Object.keys(STYLE_SUFFIXES) as ImageStyle[];
const VALID_SIZES: readonly ImageSize[] = ['1024x1024', '1024x1536', '1536x1024'];
const VALID_MODES: readonly ImageMode[] = ['single', 'sheet', 'animation'];

const COST_BY_MODE: Record<ImageMode, number> = {
  single: AI_IMAGE_COST,
  sheet: AI_SPRITE_SHEET_COST,
  animation: AI_ANIMATION_COST,
};

type Body = {
  projectId?: string;
  prompt?: string;
  style?: string;
  size?: string;
  name?: string;
  mode?: string;
  fps?: number;
};

export async function POST(request: Request) {
  // Image gen is expensive ($/call) — keep this tighter than text gen.
  const rl = checkRateLimit('ai:image', clientIp(request), 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many image requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to generate images', code: 'auth_required' },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const projectId = body?.projectId?.trim();
  const prompt = body?.prompt?.trim();
  if (!projectId || !prompt) {
    return NextResponse.json({ error: 'Missing projectId or prompt' }, { status: 400 });
  }
  if (prompt.length > 1200) {
    return NextResponse.json({ error: 'Prompt too long (max 1200 chars)' }, { status: 400 });
  }

  const style: ImageStyle = VALID_STYLES.includes(body?.style as ImageStyle)
    ? (body!.style as ImageStyle)
    : 'pixel-art';
  const mode: ImageMode = VALID_MODES.includes(body?.mode as ImageMode)
    ? (body!.mode as ImageMode)
    : 'single';
  const isMulti = mode === 'sheet' || mode === 'animation';
  const defaultSize: ImageSize = isMulti ? '1536x1024' : '1024x1024';
  const size: ImageSize = VALID_SIZES.includes(body?.size as ImageSize)
    ? (body!.size as ImageSize)
    : defaultSize;
  const cost = COST_BY_MODE[mode];

  const fps = clampFps(body?.fps, mode);

  const admin = createAdminClient();

  const { data: project, error: projectErr } = await admin
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .maybeSingle<{ id: string; user_id: string }>();
  if (projectErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  if (project.user_id !== user.id) {
    return NextResponse.json({ error: 'Not your project' }, { status: 403 });
  }

  try {
    await spendCredits({
      userId: user.id,
      amount: cost,
      reason: 'ai_image',
      metadata: { style, size, mode, projectId },
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          error: 'Not enough credits. Top up to generate images.',
          code: 'insufficient_credits',
          cost,
        },
        { status: INSUFFICIENT_CREDITS_STATUS },
      );
    }
    console.error('spend failed', err);
    return NextResponse.json({ error: 'Credit system error' }, { status: 500 });
  }

  async function refund(cause: string) {
    try {
      await grantCredits({
        userId: user!.id,
        amount: cost,
        reason: 'refund',
        metadata: { operation: 'ai_image', mode, cause },
      });
    } catch (refundErr) {
      console.error('refund failed', refundErr);
    }
  }

  let imageBuffer: Buffer;
  try {
    imageBuffer = await generateImage({ prompt, style, size, mode });
  } catch (err) {
    await refund('openai_error');
    const msg = err instanceof Error ? err.message : 'Image generation failed';
    console.error('generateImage failed', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Upload master image
  const masterPath = `${user.id}/${Date.now()}-${rand()}.png`;
  const { error: uploadErr } = await admin.storage
    .from('assets')
    .upload(masterPath, imageBuffer, {
      contentType: 'image/png',
      cacheControl: '31536000',
      upsert: false,
    });
  if (uploadErr) {
    await refund('storage_upload');
    console.error('master storage upload failed', uploadErr);
    return NextResponse.json({ error: 'Failed to save image' }, { status: 500 });
  }
  const masterUrl = admin.storage.from('assets').getPublicUrl(masterPath).data.publicUrl;

  // For multi-frame modes, slice and upload each frame, collect URLs.
  let frameMetadata: Record<string, unknown> | null = null;

  if (isMulti) {
    try {
      const sliced = await sliceSheet(imageBuffer, { cols: 3, rows: 2 });
      const frameUrls: string[] = [];
      for (const f of sliced.frames) {
        const fp = `${user.id}/${Date.now()}-${rand()}-f${f.index}.png`;
        const { error: fUpErr } = await admin.storage
          .from('assets')
          .upload(fp, f.buffer, {
            contentType: 'image/png',
            cacheControl: '31536000',
            upsert: false,
          });
        if (fUpErr) throw fUpErr;
        frameUrls.push(admin.storage.from('assets').getPublicUrl(fp).data.publicUrl);
      }

      frameMetadata = {
        mode,
        frame_count: sliced.frames.length,
        frame_urls: frameUrls,
        frame_size: { w: sliced.frames[0].width, h: sliced.frames[0].height },
        ...(mode === 'sheet'
          ? { views: SHEET_VIEW_NAMES }
          : { fps }),
      };
    } catch (err) {
      // best-effort cleanup of master
      await admin.storage.from('assets').remove([masterPath]).catch(() => {});
      await refund('slice_failed');
      console.error('sheet slice failed', err);
      return NextResponse.json({ error: 'Failed to slice frames' }, { status: 500 });
    }
  }

  const assetName = (body?.name?.trim() || prompt.slice(0, 48)) + '.png';

  const { data: asset, error: insertErr } = await admin
    .from('assets')
    .insert({
      user_id: user.id,
      project_id: projectId,
      name: assetName,
      url: masterUrl,
      type: 'image/png',
      size: imageBuffer.byteLength,
      storage_path: masterPath,
      frame_metadata: frameMetadata,
    })
    .select()
    .single();

  if (insertErr || !asset) {
    await admin.storage.from('assets').remove([masterPath]).catch(() => {});
    await refund('db_insert');
    console.error('asset insert failed', insertErr);
    return NextResponse.json({ error: 'Failed to record asset' }, { status: 500 });
  }

  return NextResponse.json({ asset });
}

function rand() {
  return Math.random().toString(36).slice(2, 10);
}

function clampFps(fps: unknown, mode: ImageMode): number {
  if (mode !== 'animation') return 0;
  const n = typeof fps === 'number' && Number.isFinite(fps) ? fps : 8;
  return Math.min(24, Math.max(2, Math.round(n)));
}
