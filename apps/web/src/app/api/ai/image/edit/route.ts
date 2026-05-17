import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  editImage,
  STYLE_SUFFIXES,
  type ImageStyle,
} from '@/lib/ai/image';
import {
  spendCredits,
  grantCredits,
  InsufficientCreditsError,
} from '@/lib/credits/server';
import {
  AI_IMAGE_EDIT_COST,
  INSUFFICIENT_CREDITS_STATUS,
} from '@/lib/credits/config';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const VALID_STYLES = Object.keys(STYLE_SUFFIXES) as ImageStyle[];

type Body = {
  assetId?: string;
  prompt?: string;
  style?: string;
};

export async function POST(request: Request) {
  const rl = checkRateLimit('ai:image:edit', clientIp(request), 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many edit requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to edit images', code: 'auth_required' },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const assetId = body?.assetId?.trim();
  const prompt = body?.prompt?.trim();
  if (!assetId || !prompt) {
    return NextResponse.json({ error: 'Missing assetId or prompt' }, { status: 400 });
  }
  if (prompt.length > 1200) {
    return NextResponse.json({ error: 'Prompt too long (max 1200 chars)' }, { status: 400 });
  }

  const style: ImageStyle = VALID_STYLES.includes(body?.style as ImageStyle)
    ? (body!.style as ImageStyle)
    : 'none';

  const admin = createAdminClient();

  // Fetch source asset + verify ownership
  const { data: source, error: sourceErr } = await admin
    .from('assets')
    .select('id, user_id, project_id, name, url, storage_path, type')
    .eq('id', assetId)
    .maybeSingle<{
      id: string;
      user_id: string;
      project_id: string;
      name: string;
      url: string;
      storage_path: string;
      type: string;
    }>();
  if (sourceErr || !source) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }
  if (source.user_id !== user.id) {
    return NextResponse.json({ error: 'Not your asset' }, { status: 403 });
  }
  if (!source.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Asset is not an image' }, { status: 400 });
  }

  // Spend credits
  try {
    await spendCredits({
      userId: user.id,
      amount: AI_IMAGE_EDIT_COST,
      reason: 'ai_image',
      metadata: { operation: 'edit', sourceAssetId: assetId, style },
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          error: 'Not enough credits. Top up to edit images.',
          code: 'insufficient_credits',
          cost: AI_IMAGE_EDIT_COST,
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
        amount: AI_IMAGE_EDIT_COST,
        reason: 'refund',
        metadata: { operation: 'ai_image_edit', cause, sourceAssetId: assetId },
      });
    } catch (refundErr) {
      console.error('refund failed', refundErr);
    }
  }

  // Call fal.ai gpt-image-2 edit. Pass the asset's public URL so fal can
  // fetch it directly — assets bucket is public-read.
  let editedBuffer: Buffer;
  try {
    editedBuffer = await editImage({ prompt, style, imageUrl: source.url });
  } catch (err) {
    await refund('fal_error');
    const msg = err instanceof Error ? err.message : 'Image edit failed';
    console.error('editImage failed', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Upload as a new asset (keep source intact for non-destructive edits)
  const storagePath = `${user.id}/${Date.now()}-edit-${Math.random().toString(36).slice(2, 10)}.png`;
  const { error: uploadErr } = await admin.storage
    .from('assets')
    .upload(storagePath, editedBuffer, {
      contentType: 'image/png',
      cacheControl: '31536000',
      upsert: false,
    });
  if (uploadErr) {
    await refund('storage_upload');
    console.error('storage upload failed', uploadErr);
    return NextResponse.json({ error: 'Failed to save image' }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = admin.storage.from('assets').getPublicUrl(storagePath);

  const baseName = source.name.replace(/\.(png|jpg|jpeg|gif|svg)$/i, '');
  const newName = `${baseName} (edit).png`;

  const { data: asset, error: insertErr } = await admin
    .from('assets')
    .insert({
      user_id: user.id,
      project_id: source.project_id,
      name: newName,
      url: publicUrl,
      type: 'image/png',
      size: editedBuffer.byteLength,
      storage_path: storagePath,
    })
    .select()
    .single();

  if (insertErr || !asset) {
    await admin.storage.from('assets').remove([storagePath]).catch(() => {});
    await refund('db_insert');
    console.error('asset insert failed', insertErr);
    return NextResponse.json({ error: 'Failed to record asset' }, { status: 500 });
  }

  return NextResponse.json({ asset });
}
