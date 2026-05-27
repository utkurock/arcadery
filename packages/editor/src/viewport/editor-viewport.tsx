 
'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Heart } from 'lucide-react';
import type { RuntimeState } from '@arcadery/engine';
import { GameCanvas } from '@arcadery/engine';
import { SceneRenderer } from './scene-renderer';
import { TransformControlsWrapper } from './transform-controls-wrapper';
import { MarqueeR3F } from './marquee-r3f';
import { MarqueeDom } from './marquee-dom';
import { SelectionHud } from './selection-hud';
import { SnapGuides } from './snap-guides';
import { AssetDropHandler } from './asset-drop-handler';
import { useEditorStore } from '../stores/editor-store';
import { useShallow } from 'zustand/react/shallow';

const PhaserCanvas = dynamic(
  () => import('@arcadery/engine/phaser').then((mod) => ({ default: mod.PhaserCanvas })),
  { ssr: false },
);

const PlayCanvas3D = dynamic(
  () => import('@arcadery/engine').then((mod) => ({ default: mod.PlayCanvas3D })),
  { ssr: false },
);

/** True when a "three" scene carries a 3D-capable controller, so test-play
 *  should run the live 3D runtime instead of the static editor viewport. */
function has3DController(scene: { elements?: Record<string, { behaviors?: Array<{ type: string }> }> }): boolean {
  for (const el of Object.values(scene.elements ?? {})) {
    if (
      el.behaviors?.some(
        (b) => b.type === 'third-person-controller' || b.type === 'top-down-controller',
      )
    ) {
      return true;
    }
  }
  return false;
}

export function EditorViewport() {
  const mode = useEditorStore((s) => s.mode);
  const viewMode = useEditorStore((s) => s.viewMode);
  const renderEngine = useEditorStore((s) => s.scene.settings?.renderEngine || 'three');
  const elements = useEditorStore(useShallow((s) => s.scene.elements));
  const backgroundColor = useEditorStore((s) => s.scene.settings?.backgroundColor || '#17181e');
  const primarySelectedId = useEditorStore((s) => s.selectedIds[0] ?? null);
  const paintTile = useEditorStore((s) => s.paintTile);
  const scene = useEditorStore((s) => s.scene);
  const hoveredId = useEditorStore((s) => s.hoveredId);
  const marqueeActive = useEditorStore((s) => s.marqueeRect !== null);
  const isEditMode = mode === 'edit';
  const isPlayMode = mode === 'play';

  const [runtimeState, setRuntimeState] = useState<RuntimeState | null>(null);

  if (renderEngine === 'phaser') {
    return (
      <div className="w-full h-full relative">
        <PhaserCanvas
          elements={elements}
          backgroundColor={backgroundColor}
          isEditMode={isEditMode}
          selectedId={primarySelectedId}
          paintTile={paintTile}
          scene={isPlayMode ? scene : undefined}
          onGameStateChange={isPlayMode ? setRuntimeState : undefined}
          onSelectElement={(id) => {
            if (isEditMode) {
              // Phaser callback may pass null (empty-canvas click) — bridge to clearSelection.
              if (id === null) {
                useEditorStore.getState().clearSelection();
              } else {
                useEditorStore.getState().setSelectedIds([id]);
              }
            }
          }}
          onPaintCell={(elementId, row, col, tileIndex) => {
            useEditorStore.getState().paintTileAt(elementId, row, col, tileIndex);
          }}
          onEraseCell={(elementId, row, col) => {
            useEditorStore.getState().erasePaintAt(elementId, row, col);
          }}
        />

        {/* Paint mode indicator */}
        {paintTile && primarySelectedId && isEditMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg bg-[#8b7ec8]/90 backdrop-blur text-white text-xs font-semibold flex items-center gap-2 shadow-lg">
            <span>🖌</span>
            <span>Painting tile #{paintTile.assetIndex} — click to paint, shift/right-click to erase</span>
            <button
              onClick={() => useEditorStore.getState().setPaintTile(null)}
              className="ml-2 text-white/70 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Live HUD during test play */}
        {isPlayMode && runtimeState && (
          <PlayHud state={runtimeState} />
        )}
      </div>
    );
  }

  // 3D test-play: run the live runtime + HUD instead of the static viewport.
  if (isPlayMode && has3DController(scene)) {
    return (
      <div className="w-full h-full relative">
        <PlayCanvas3D
          scene={scene}
          backgroundColor={backgroundColor}
          onGameStateChange={setRuntimeState}
        />
        {runtimeState && <PlayHud state={runtimeState} />}
      </div>
    );
  }

  return (
    <div
      className={`w-full h-full relative ${
        marqueeActive ? 'cursor-crosshair' : hoveredId ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
      }`}
      data-canvas-root
      tabIndex={0}
      role="application"
      // Drop target for assets dragged in from the Asset Manager. Precision
      // drop (world-coord placement at cursor) is future work; for the v1
      // gesture we just route through the same addSpriteFromAsset/
      // addModelFromAsset path the "Use in scene" button uses. Element is
      // selected after add so the user can immediately translate it.
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-arcadery-asset')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData('application/x-arcadery-asset');
        if (!raw) return;
        e.preventDefault();
        try {
          const a = JSON.parse(raw) as {
            id: string;
            name?: string;
            url: string;
            type: string;
            frameMetadata?: {
              mode?: string;
              frame_urls?: string[];
              fps?: number;
              frame_size?: { w: number; h: number };
            } | null;
          };
          // Queue the drop for the in-Canvas <AssetDropHandler> to consume.
          // It owns the camera/raycaster, so it can place the new element at
          // the cursor's world position (not the scene center).
          const isModel =
            a.type.startsWith('model/') || a.frameMetadata?.mode === 'model';
          const aspect = a.frameMetadata?.frame_size
            ? a.frameMetadata.frame_size.w / a.frameMetadata.frame_size.h
            : 1;
          useEditorStore.getState().setPendingAssetDrop({
            payload: {
              id: a.id,
              url: a.url,
              name: a.name,
              type: a.type,
              aspectRatio: aspect,
              isModel,
              ...(a.frameMetadata?.mode === 'animation' && a.frameMetadata.frame_urls
                ? {
                    frameUrls: a.frameMetadata.frame_urls,
                    frameRate: a.frameMetadata.fps ?? 8,
                  }
                : {}),
            },
            screen: { x: e.clientX, y: e.clientY },
          });
        } catch {}
      }}
    >
      <GameCanvas
        cameraType={viewMode}
        showGrid={isEditMode}
        showHelpers={isEditMode}
      >
        <SceneRenderer />
        {isEditMode && <TransformControlsWrapper />}
        {/* B5 fix: MarqueeR3F mounts INSIDE Canvas (uses useThree); returns null. */}
        {isEditMode && <MarqueeR3F />}
        {/* Snap modifier feedback + DOM-drop → world-position placement.
            Both live inside the Canvas because they need camera/raycaster
            access; both early-return when not active so the runtime cost is
            ~zero outside their gestures. */}
        {isEditMode && <SnapGuides />}
        {isEditMode && <AssetDropHandler />}
      </GameCanvas>
      {/* B5 fix: MarqueeDom mounts OUTSIDE Canvas as a sibling div.
          Pointer handlers + brand-purple rectangle live here. */}
      {isEditMode && <MarqueeDom />}
      {/* Selection-count HUD (z-30) — mounts only when selectedIds.length >= 2 */}
      <SelectionHud />
    </div>
  );
}

function PlayHud({ state }: { state: RuntimeState }) {
  return (
    <>
      <div className="pointer-events-none absolute top-3 left-3 z-30 flex flex-col gap-2 select-none">
        <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-1.5 flex items-center gap-2 font-mono">
          <span className="text-[9px] uppercase tracking-widest text-white/50">Score</span>
          <span className="text-base font-bold text-yellow-300 tabular-nums">{state.score}</span>
        </div>
        <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-1.5 flex items-center gap-1">
          {Array.from({ length: Math.max(0, state.health) }).map((_, i) => (
            <Heart key={i} className="w-3 h-3 text-red-400 fill-red-400" />
          ))}
          {state.health <= 0 && (
            <span className="text-[10px] uppercase tracking-widest text-red-400/80">No HP</span>
          )}
        </div>
      </div>

      {state.paused && state.status === 'playing' && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="rounded-xl border border-white/10 bg-[#13141a] px-5 py-3 text-center">
            <p className="text-sm font-semibold text-white">Paused</p>
            <p className="text-[10px] text-white/40">Esc to resume · Stop to exit</p>
          </div>
        </div>
      )}

      {state.status !== 'playing' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-xl border border-white/10 bg-[#13141a] px-6 py-4 text-center">
            <h2 className={`text-2xl font-bold mb-1 ${
              state.status === 'won' ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {state.status === 'won' ? 'You won!' : 'Game over'}
            </h2>
            <p className="text-xs text-white/50 mb-3">
              Score <span className="text-white font-semibold">{state.score}</span>
            </p>
            <button
              onClick={() => {
                useEditorStore.getState().setMode('edit');
                // re-enter play immediately to reset state
                setTimeout(() => useEditorStore.getState().setMode('play'), 30);
              }}
              className="rounded-md bg-[#5db8a8] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#4ca597] transition-colors mr-2"
            >
              Restart
            </button>
            <button
              onClick={() => useEditorStore.getState().setMode('edit')}
              className="rounded-md border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 transition-colors"
            >
              Edit
            </button>
          </div>
        </div>
      )}
    </>
  );
}
