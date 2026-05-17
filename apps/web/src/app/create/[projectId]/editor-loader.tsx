'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEditorStore } from '@arcadery/editor';
import type { AssetManagerProps, AssetData } from '@arcadery/editor';
import { useAutoSave } from '@/hooks/use-auto-save';
import { useAssets } from '@/hooks/use-assets';
import { ASSET_PACKS } from '@/lib/asset-packs';
import { createClient } from '@/lib/supabase/client';
import { generateSlug } from '@/lib/slugify';
import type { Project } from './create-client';

// Credits pill in the editor top-bar so the user can see their remaining
// balance while making AI calls. Replaces the previous wallet pill — wallet
// identity belongs in the dashboard chrome (sidebar), not the focused editor.
const CreditBalance = dynamic(
  () => import('@/components/credits/credit-balance').then((m) => m.CreditBalance),
  { ssr: false },
);

const EditorShell = dynamic(
  () => import('@arcadery/editor').then((mod) => ({ default: mod.EditorShell })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen w-screen bg-[#13141a] text-white">
        <div className="text-sm text-gray-500">Loading editor...</div>
      </div>
    ),
  },
);

const ElementContextMenu = dynamic(
  () => import('@arcadery/editor').then((mod) => ({ default: mod.ElementContextMenu })),
  { ssr: false },
);

export function EditorLoader({ initialProject, initialPrompt }: { initialProject: Project; initialPrompt?: string }) {
  const hydratedRef = useRef(false);
  const router = useRouter();
  const saveStatus = useAutoSave(initialProject.id);

  const userId = initialProject.user_id;
  const { assets, uploading, error, uploadAsset, deleteAsset, generateAsset, generateModel, editAsset } = useAssets(initialProject.id, userId);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    // Schema mismatches on a stored scene shouldn't crash the editor entirely;
    // the user can still discard or remix from a fresh template.
    try {
      useEditorStore.getState().loadScene(initialProject.scene);
    } catch (err) {
      console.error('Failed to load scene into editor:', err);
    }
  }, [initialProject.scene]);

  const handleLogout = useCallback(async () => {
    const supabase = createClient();
    // Clear the auto-resign flag so the next page (or the marketing homepage)
    // doesn't immediately ask the wallet to re-sign via WalletAuthBridge.
    try {
      localStorage.removeItem('arcadery_signed_in_before');
    } catch {}
    await supabase.auth.signOut();
    router.push('/');
  }, [router]);

  const handleUpload = useCallback(async (file: File) => {
    await uploadAsset(file);
  }, [uploadAsset]);

  const handleGenerate = useCallback(
    async (opts: { prompt: string; style: string; mode: string }) => {
      await generateAsset(opts);
    },
    [generateAsset],
  );

  const handleGenerate3D = useCallback(
    async (opts: { prompt: string; artStyle: string }) => {
      await generateModel(opts);
    },
    [generateModel],
  );

  const handleEdit = useCallback(
    async (asset: AssetData, opts: { prompt: string; style: string }) => {
      await editAsset(asset.id, opts);
    },
    [editAsset],
  );

  const handleModifyAi = useCallback(
    async ({
      elementId,
      assetId,
      prompt,
    }: {
      elementId: string;
      assetId: string;
      prompt: string;
    }) => {
      const newAsset = await editAsset(assetId, { prompt });
      const fm = newAsset.frame_metadata;
      useEditorStore.getState().swapSpriteAsset(elementId, {
        id: newAsset.id,
        url: newAsset.url,
        ...(fm?.mode === 'animation'
          ? { frameUrls: fm.frame_urls, frameRate: fm.fps ?? 8 }
          : {}),
      });
    },
    [editAsset],
  );

  const handleDelete = useCallback((asset: AssetData) => {
    // The useAssets hook expects the full Asset type, but we only have AssetData
    // We find the matching full asset from the assets array
    const fullAsset = assets.find((a) => a.id === asset.id);
    if (fullAsset) {
      deleteAsset(fullAsset);
    }
  }, [assets, deleteAsset]);

  const handleUseInScene = useCallback((asset: AssetData) => {
    const store = useEditorStore.getState();
    const fm = asset.frameMetadata;

    // 3D model assets get their own element type.
    if (asset.type.startsWith('model/') || fm?.mode === 'model') {
      store.addModelFromAsset({
        id: asset.id,
        url: asset.url,
        name: asset.name,
      });
      return;
    }

    // 2D images → sprite (static or animated).
    const aspect = fm?.frame_size ? fm.frame_size.w / fm.frame_size.h : 1;
    store.addSpriteFromAsset({
      id: asset.id,
      url: asset.url,
      name: asset.name,
      aspectRatio: aspect,
      ...(fm?.mode === 'animation' && fm.frame_urls
        ? { frameUrls: fm.frame_urls, frameRate: fm.fps ?? 8 }
        : {}),
    });
  }, []);

  const publishInFlightRef = useRef(false);
  const handlePublish = useCallback(async (): Promise<string | null> => {
    // Single-flight guard. The editor's publish button is upstream of us so
    // we can't disable it directly; a fast double-tap on a slow network used
    // to fire two concurrent select→insert pairs (no client lock, no unique
    // constraint guarantee) and the second one bubbled an opaque error.
    if (publishInFlightRef.current) return null;
    publishInFlightRef.current = true;
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const scene = useEditorStore.getState().scene;
      const projectName = initialProject.name;

      // Check if already published
      const { data: existing } = await supabase
        .from('published_games')
        .select('id, slug')
        .eq('project_id', initialProject.id)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        // Re-publish: update scene snapshot
        await supabase
          .from('published_games')
          .update({ scene, name: projectName })
          .eq('id', existing.id);
        return existing.slug;
      }

      // Resolve a human-friendly creator name. Wallet auth synthesises emails
      // like "<base58>@wallet.arcadery.xyz", so falling back to the email's
      // local part would just print the raw pubkey — ugly. Prefer a configured
      // display name, then a truncated wallet, then 'Anonymous'.
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('display_name, wallet_address')
        .eq('id', user.id)
        .maybeSingle<{ display_name: string | null; wallet_address: string | null }>();

      const wallet = profile?.wallet_address ?? null;
      const truncatedWallet = wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : null;
      const fullName = (user.user_metadata?.full_name as string | undefined) ?? null;
      const creatorName =
        profile?.display_name?.trim() ||
        fullName?.trim() ||
        truncatedWallet ||
        'Anonymous';

      // First publish: generate slug and insert
      const slug = generateSlug(projectName);
      const { data, error } = await supabase
        .from('published_games')
        .insert({
          project_id: initialProject.id,
          user_id: user.id,
          slug,
          name: projectName,
          scene,
          creator_name: creatorName,
        })
        .select('slug')
        .single();

      if (error) throw error;
      return data.slug;
    } catch (err) {
      console.error('Publish failed:', err);
      return null;
    } finally {
      publishInFlightRef.current = false;
    }
  }, [initialProject.id, initialProject.name]);

  const assetProps: AssetManagerProps = useMemo(() => ({
    assets: assets.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
      type: a.type,
      frameMetadata: a.frame_metadata ?? null,
    })),
    uploading,
    error,
    onUpload: handleUpload,
    onDelete: handleDelete,
    onUseInScene: handleUseInScene,
    onGenerate: handleGenerate,
    onGenerate3D: handleGenerate3D,
    onEdit: handleEdit,
  }), [assets, uploading, error, handleUpload, handleDelete, handleUseInScene, handleGenerate, handleGenerate3D, handleEdit]);

  return (
    <>
      <EditorShell
        projectId={initialProject.id}
        projectName={initialProject.name}
        saveStatus={saveStatus}
        onLogout={handleLogout}
        assetProps={assetProps}
        onPublish={handlePublish}
        initialPrompt={initialPrompt}
        assetPacks={ASSET_PACKS}
        topBarRightSlot={<CreditBalance compact />}
      />
      <ElementContextMenu onModifyAi={handleModifyAi} />
    </>
  );
}
