'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface AssetFrameMetadata {
  mode: 'sheet' | 'animation';
  frame_count: number;
  frame_urls: string[];
  frame_size: { w: number; h: number };
  fps?: number;
  views?: readonly string[];
}

interface Asset {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  storage_path: string;
  created_at: string;
  frame_metadata?: AssetFrameMetadata | null;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/gif',
];

export function useAssets(projectId: string, userId: string) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs that mirror the latest props so async operations (which captured an
  // old projectId in their closure) can poll for the up-to-date value. This
  // is what makes the fast-path /create/new flow tolerable for early uploads:
  // the user can click "upload" while `projectId` is still `local-pending-X`,
  // and the upload action waits a beat for the background insert to swap in
  // the real UUID before erroring out.
  const projectIdRef = useRef(projectId);
  const userIdRef = useRef(userId);
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  /**
   * Resolve to a real DB-backed projectId, polling briefly if the current one
   * is still a `local-pending-*` placeholder. Returns null on timeout or when
   * the user is a guest (no real account at all).
   */
  async function awaitRealProjectContext(
    maxMs = 5000,
  ): Promise<{ projectId: string; userId: string } | null> {
    if (userIdRef.current === 'guest' || userIdRef.current === 'dev') return null;
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const pid = projectIdRef.current;
      const uid = userIdRef.current;
      if (!pid.startsWith('local-') && uid !== 'pending' && uid !== 'guest') {
        return { projectId: pid, userId: uid };
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    return null;
  }

  const loadAssets = useCallback(async () => {
    setError(null);

    // Skip DB for guest/local projects (non-UUID IDs)
    if (userId === 'dev' || userId === 'guest' || projectId.startsWith('local-')) return;

    const supabase = createClient();

    const { data, error: fetchError } = await supabase
      .from('assets')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setAssets(data ?? []);
  }, [projectId, userId]);

  const uploadAsset = useCallback(
    async (file: File): Promise<Asset> => {
      setError(null);

      // Client-side validation: file size
      if (file.size > MAX_FILE_SIZE) {
        const msg = `File too large. Maximum size is 5MB, got ${(file.size / (1024 * 1024)).toFixed(1)}MB.`;
        setError(msg);
        throw new Error(msg);
      }

      // Client-side validation: MIME type
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        const msg = `Unsupported file type "${file.type}". Allowed: PNG, JPEG, SVG, GIF.`;
        setError(msg);
        throw new Error(msg);
      }

      // Guests can't upload at all. For signed-in users whose project row is
      // still being created in the background (fast-path /create/new), wait
      // up to 5s for the real projectId to settle.
      const ctx = await awaitRealProjectContext();
      if (!ctx) {
        const msg =
          userIdRef.current === 'guest'
            ? 'Sign in to upload assets.'
            : 'Project is still being created — please try again in a moment.';
        setError(msg);
        throw new Error(msg);
      }
      const realProjectId = ctx.projectId;
      const realUserId = ctx.userId;

      setUploading(true);

      try {
        const supabase = createClient();
        const ext = file.name.split('.').pop();
        const storagePath = `${realUserId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('assets')
          .upload(storagePath, file, {
            cacheControl: '31536000',
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          setError(uploadError.message);
          throw new Error(uploadError.message);
        }

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from('assets').getPublicUrl(uploadData.path);

        // Insert DB record
        const { data: record, error: insertError } = await supabase
          .from('assets')
          .insert({
            user_id: realUserId,
            project_id: realProjectId,
            name: file.name,
            url: publicUrl,
            type: file.type,
            size: file.size,
            storage_path: storagePath,
          })
          .select()
          .single();

        if (insertError) {
          // Clean up uploaded file on DB insert failure
          await supabase.storage.from('assets').remove([storagePath]);
          setError(insertError.message);
          throw new Error(insertError.message);
        }

        // Prepend to local state
        setAssets((prev) => [record, ...prev]);
        return record;
      } finally {
        setUploading(false);
      }
    },
    [projectId, userId],
  );

  const generateAsset = useCallback(
    async (opts: { prompt: string; style?: string; size?: string; mode?: string }): Promise<Asset> => {
      setError(null);
      const ctx = await awaitRealProjectContext();
      if (!ctx) {
        const msg =
          userIdRef.current === 'guest'
            ? 'Sign in to generate images.'
            : 'Project is still being created — please try again in a moment.';
        setError(msg);
        throw new Error(msg);
      }

      setUploading(true);
      try {
        const res = await fetch('/api/ai/image', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId: ctx.projectId, ...opts }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({} as Record<string, unknown>));
          if (res.status === 401 && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('arcadery:auth-required'));
          }
          if (res.status === 402 && typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('arcadery:insufficient-credits', { detail: payload }),
            );
          }
          const msg = typeof payload.error === 'string' ? payload.error : 'Generation failed';
          setError(msg);
          throw new Error(msg);
        }
        const { asset } = (await res.json()) as { asset: Asset };
        setAssets((prev) => [asset, ...prev]);
        return asset;
      } finally {
        setUploading(false);
      }
    },
    [projectId, userId],
  );

  const generateModel = useCallback(
    async (opts: { prompt: string; artStyle?: string }): Promise<Asset> => {
      setError(null);
      const ctx = await awaitRealProjectContext();
      if (!ctx) {
        const msg =
          userIdRef.current === 'guest'
            ? 'Sign in to generate models.'
            : 'Project is still being created — please try again in a moment.';
        setError(msg);
        throw new Error(msg);
      }
      setUploading(true);
      try {
        const res = await fetch('/api/ai/model', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId: ctx.projectId, ...opts }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({} as Record<string, unknown>));
          if (res.status === 401 && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('arcadery:auth-required'));
          }
          if (res.status === 402 && typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('arcadery:insufficient-credits', { detail: payload }),
            );
          }
          const msg = typeof payload.error === 'string' ? payload.error : '3D generation failed';
          setError(msg);
          throw new Error(msg);
        }
        const json = (await res.json()) as { asset?: Asset; pending?: boolean; taskId?: string };
        if (json.pending || !json.asset) {
          throw new Error('Generation still in progress — please try again in a minute');
        }
        setAssets((prev) => [json.asset!, ...prev]);
        return json.asset;
      } finally {
        setUploading(false);
      }
    },
    [projectId, userId],
  );

  const editAsset = useCallback(
    async (assetId: string, opts: { prompt: string; style?: string }): Promise<Asset> => {
      setError(null);
      setUploading(true);
      try {
        const res = await fetch('/api/ai/image/edit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ assetId, ...opts }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({} as Record<string, unknown>));
          if (res.status === 401 && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('arcadery:auth-required'));
          }
          if (res.status === 402 && typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('arcadery:insufficient-credits', { detail: payload }),
            );
          }
          const msg = typeof payload.error === 'string' ? payload.error : 'Edit failed';
          setError(msg);
          throw new Error(msg);
        }
        const { asset } = (await res.json()) as { asset: Asset };
        setAssets((prev) => [asset, ...prev]);
        return asset;
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  const deleteAsset = useCallback(async (asset: Asset) => {
    setError(null);
    const supabase = createClient();

    // Sliced sprite sheets and animations store each frame at its own storage
    // path. Without sweeping these, every delete leaks N frames into 'assets'.
    const paths = [asset.storage_path];
    const frameUrls = asset.frame_metadata?.frame_urls;
    if (Array.isArray(frameUrls)) {
      const marker = '/object/public/assets/';
      for (const url of frameUrls) {
        if (typeof url !== 'string') continue;
        const idx = url.indexOf(marker);
        if (idx === -1) continue;
        const path = decodeURIComponent(url.slice(idx + marker.length));
        if (path && path !== asset.storage_path) paths.push(path);
      }
    }

    // Delete from storage. We don't fail the whole flow if a frame is already
    // missing — Supabase remove() is idempotent and reports per-file errors
    // only via the response, which we ignore here on purpose.
    const { error: storageError } = await supabase.storage
      .from('assets')
      .remove(paths);

    if (storageError) {
      setError(storageError.message);
      throw new Error(storageError.message);
    }

    // Delete from DB
    const { error: dbError } = await supabase
      .from('assets')
      .delete()
      .eq('id', asset.id);

    if (dbError) {
      setError(dbError.message);
      throw new Error(dbError.message);
    }

    // Remove from local state
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
  }, []);

  // Load assets on mount
  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  return { assets, uploading, error, loadAssets, uploadAsset, deleteAsset, generateAsset, generateModel, editAsset };
}
