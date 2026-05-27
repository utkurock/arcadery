import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadGlb } from './meshy';

/**
 * Shared GLB persistence for the Meshy model pipeline (generate / refine / rig).
 * Downloads a GLB from a Meshy URL, uploads it to the `assets` storage bucket,
 * and either inserts a new asset row or replaces an existing one's GLB.
 */

type Admin = SupabaseClient;

function glbPath(userId: string): string {
  return `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.glb`;
}

/** Download a Meshy GLB and insert it as a NEW asset row. Returns the asset. */
export async function saveGlbAsset(params: {
  admin: Admin;
  userId: string;
  projectId: string;
  name: string;
  glbUrl: string;
  frameMetadata: Record<string, unknown>;
}) {
  const { admin, userId, projectId, name, glbUrl, frameMetadata } = params;
  const buffer = await downloadGlb(glbUrl);
  const path = glbPath(userId);

  const { error: uploadErr } = await admin.storage.from('assets').upload(path, buffer, {
    contentType: 'model/gltf-binary',
    cacheControl: '31536000',
    upsert: false,
  });
  if (uploadErr) throw new Error('storage_upload');

  const publicUrl = admin.storage.from('assets').getPublicUrl(path).data.publicUrl;

  const { data: asset, error: insertErr } = await admin
    .from('assets')
    .insert({
      user_id: userId,
      project_id: projectId,
      name,
      url: publicUrl,
      type: 'model/gltf-binary',
      size: buffer.byteLength,
      storage_path: path,
      frame_metadata: frameMetadata,
    })
    .select()
    .single();

  if (insertErr || !asset) {
    await admin.storage.from('assets').remove([path]).catch(() => {});
    throw new Error('db_insert');
  }
  return asset;
}

/**
 * Download a Meshy GLB and REPLACE an existing asset's model in place
 * (new storage file, updated url/size, merged frame_metadata, old file removed).
 */
export async function replaceGlbAsset(params: {
  admin: Admin;
  asset: { id: string; user_id: string; storage_path: string; frame_metadata: Record<string, unknown> | null };
  glbUrl: string;
  frameMetadataPatch: Record<string, unknown>;
}) {
  const { admin, asset, glbUrl, frameMetadataPatch } = params;
  const buffer = await downloadGlb(glbUrl);
  const path = glbPath(asset.user_id);

  const { error: uploadErr } = await admin.storage.from('assets').upload(path, buffer, {
    contentType: 'model/gltf-binary',
    cacheControl: '31536000',
    upsert: false,
  });
  if (uploadErr) throw new Error('storage_upload');

  const publicUrl = admin.storage.from('assets').getPublicUrl(path).data.publicUrl;

  const { data: updated, error: updateErr } = await admin
    .from('assets')
    .update({
      url: publicUrl,
      size: buffer.byteLength,
      storage_path: path,
      frame_metadata: { ...(asset.frame_metadata ?? {}), ...frameMetadataPatch },
    })
    .eq('id', asset.id)
    .select()
    .single();

  if (updateErr || !updated) {
    await admin.storage.from('assets').remove([path]).catch(() => {});
    throw new Error('db_update');
  }

  // Best-effort: remove the superseded GLB so storage doesn't accumulate.
  if (asset.storage_path && asset.storage_path !== path) {
    await admin.storage.from('assets').remove([asset.storage_path]).catch(() => {});
  }
  return updated;
}
