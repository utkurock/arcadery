'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useEditorStore } from '@arcadery/editor';

const GameCanvas = dynamic(
  () => import('@arcadery/engine').then((mod) => ({ default: mod.GameCanvas })),
  { ssr: false },
);

const ReadOnlySceneRenderer = dynamic(
  () => import('@arcadery/editor').then((mod) => ({ default: mod.ReadOnlySceneRenderer })),
  { ssr: false },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function EmbedClient({ scene }: { scene: any }) {
  const hydratedRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    // An older / migrated scene can throw inside the editor store's loadScene
    // (schema mismatch, missing required fields). The embed has no chrome to
    // surface a React error boundary cleanly — show a tiny inline note instead
    // and keep the iframe from blanking the embedding site.
    try {
      useEditorStore.getState().loadScene(scene);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load scene');
    }
  }, [scene]);

  if (loadError) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#17181e] text-center">
        <p className="px-4 text-xs text-white/50">
          This game can&apos;t be embedded right now.
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen">
      <GameCanvas cameraType="3d" showGrid={false} backgroundColor="#17181e">
        <ReadOnlySceneRenderer />
      </GameCanvas>
    </div>
  );
}
