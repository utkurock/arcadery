import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import {
  createEmptyScene,
  createSpriteElement,
  createModelElement,
  DEFAULT_ECONOMY,
} from '@arcadery/shared';
import type { EditorState } from './types';

export const useEditorStore = create<EditorState>()(
  temporal(
    immer((set) => ({
      scene: createEmptyScene(),
      selectedIds: [],
      hoveredId: null,
      marqueeHoverIds: new Set<string>(),
      marqueeRect: null,
      mode: 'edit' as const,
      // Default tool is the cursor/select tool — free click-drag with no gizmo
      // handles, like Figma's V tool. Users switch to Move/Rotate/Scale when
      // they want axis-locked precision.
      transformMode: 'select' as const,
      viewMode: '3d' as const,

      addElement: (element) => {
        set((state) => {
          state.scene.elements[element.id] = element;
        });
      },

      addSpriteFromAsset: (asset) => {
        const aspect = asset.aspectRatio && asset.aspectRatio > 0 ? asset.aspectRatio : 1;
        const baseSize = 2;
        const width = aspect >= 1 ? baseSize : baseSize * aspect;
        const height = aspect >= 1 ? baseSize / aspect : baseSize;
        const sprite = createSpriteElement({
          name: asset.name?.replace(/\.[a-z0-9]+$/i, '') ?? 'Sprite',
          width,
          height,
          src: asset.url,
          ...(asset.id ? { assetId: asset.id } : {}),
          ...(asset.frameUrls && asset.frameUrls.length >= 2
            ? {
                frameUrls: asset.frameUrls,
                frameRate: asset.frameRate ?? 8,
                loopMode: 'loop' as const,
              }
            : {}),
        });
        set((state) => {
          state.scene.elements[sprite.id] = sprite;
          state.selectedIds = [sprite.id];
        });
        return sprite.id;
      },

      addModelFromAsset: (asset) => {
        const model = createModelElement({
          name: asset.name?.replace(/\.[a-z0-9]+$/i, '') ?? 'Model',
          src: asset.url,
          ...(asset.id ? { assetId: asset.id } : {}),
        });
        set((state) => {
          state.scene.elements[model.id] = model;
          state.selectedIds = [model.id];
        });
        return model.id;
      },

      contextMenuTarget: null,
      openContextMenu: (target) => {
        set((state) => {
          state.contextMenuTarget = target;
          state.selectedIds = [target.elementId];
        });
      },
      closeContextMenu: () => {
        set((state) => {
          state.contextMenuTarget = null;
        });
      },

      swapSpriteAsset: (elementId, asset) => {
        set((state) => {
          const el = state.scene.elements[elementId];
          if (!el || el.type !== 'sprite') return;
          el.src = asset.url;
          if (asset.id) el.assetId = asset.id;
          if (asset.frameUrls && asset.frameUrls.length >= 2) {
            el.frameUrls = asset.frameUrls;
            el.frameRate = asset.frameRate ?? el.frameRate ?? 8;
            el.loopMode = el.loopMode ?? 'loop';
          } else {
            el.frameUrls = undefined;
          }
        });
      },

      removeElement: (id) => {
        set((state) => {
          delete state.scene.elements[id];
          // Multi-aware: remove this id from selection if present (no-op if not).
          state.selectedIds = state.selectedIds.filter((sid) => sid !== id);
          // Also clear hover if pointing at the deleted element.
          if (state.hoveredId === id) state.hoveredId = null;
        });
      },

      updateElement: (id, patch) => {
        set((state) => {
          const el = state.scene.elements[id];
          if (el) {
            Object.assign(el, patch);
          }
        });
      },

      updateElementTransform: (id, patch) => {
        set((state) => {
          const el = state.scene.elements[id];
          if (el) {
            if (patch.position) Object.assign(el.transform.position, patch.position);
            if (patch.rotation) Object.assign(el.transform.rotation, patch.rotation);
            if (patch.scale) Object.assign(el.transform.scale, patch.scale);
          }
        });
      },

      setTransformMode: (mode) => {
        set((state) => {
          state.transformMode = mode;
        });
      },

      setViewMode: (mode) => {
        set((state) => {
          state.viewMode = mode;
        });
      },

      setMode: (mode) => {
        set((state) => {
          state.mode = mode;
        });
      },

      loadScene: (scene) => {
        set((state) => {
          // Backfill economy on legacy scenes that pre-date the field.
          state.scene = { ...scene, economy: scene.economy ?? DEFAULT_ECONOMY };
        });
      },

      setSceneName: (name: string) => {
        set((state) => {
          state.scene.name = name;
        });
      },

      setRenderEngine: (engine: 'three' | 'phaser') => {
        set((state) => {
          state.scene.settings.renderEngine = engine;
        });
      },

      setEconomy: (economy) => {
        set((state) => {
          state.scene.economy = economy;
        });
      },

      setGameState: (config) => {
        set((state) => {
          state.scene.gameState = config;
        });
      },

      updateSceneSettings: (patch) => {
        set((state) => {
          Object.assign(state.scene.settings, patch);
        });
      },

      paintTile: null,
      setPaintTile: (tile) => {
        set((state) => {
          state.paintTile = tile;
        });
      },

      paintTileAt: (elementId, row, col, tileIndex) => {
        set((state) => {
          const el = state.scene.elements[elementId];
          if (!el || el.type !== 'tilemap') return;
          const tiles = (el.tiles = el.tiles || []);
          // Remove existing tile at this position
          const idx = tiles.findIndex((t) => t[0] === row && t[1] === col);
          if (idx !== -1) tiles.splice(idx, 1);
          tiles.push([row, col, tileIndex]);
        });
      },

      erasePaintAt: (elementId, row, col) => {
        set((state) => {
          const el = state.scene.elements[elementId];
          if (!el || el.type !== 'tilemap') return;
          const tiles = el.tiles || [];
          const idx = tiles.findIndex((t) => t[0] === row && t[1] === col);
          if (idx !== -1) tiles.splice(idx, 1);
        });
      },

      // -------------------------------------------------------------------------
      // STORE-01 — Ephemeral runtime slices (chatAttachment, dragFromCanvas,
      // pendingDrop, animationRuntime). All four live as flat-root properties so
      // the existing partialize at line ~217 ({ scene: state.scene }) auto-
      // excludes them from zundo's undo history (STORE-02). DO NOT add any of
      // these to partialize. DO NOT nest them under state.scene.
      // -------------------------------------------------------------------------

      // STORE-01 — Chat attachment slice
      chatAttachment: null,
      setChatAttachment: (attachment) => {
        set((state) => {
          state.chatAttachment = attachment;
        });
      },
      clearChatAttachment: () => {
        set((state) => {
          state.chatAttachment = null;
        });
      },

      // STORE-01 — Drag-from-canvas slice
      dragFromCanvas: null,
      startDragFromCanvas: (drag) => {
        set((state) => {
          state.dragFromCanvas = drag;
        });
      },
      endDragFromCanvas: () => {
        set((state) => {
          state.dragFromCanvas = null;
        });
      },

      // STORE-01 — Pending-drop slice
      pendingDrop: null,
      setPendingDrop: (drop) => {
        set((state) => {
          state.pendingDrop = drop;
        });
      },
      clearPendingDrop: () => {
        set((state) => {
          state.pendingDrop = null;
        });
      },

      // STORE-01 — Animation runtime slice
      animationRuntime: { states: {} },
      setAnimationFrame: (elementId, frameIndex) => {
        set((state) => {
          const existing = state.animationRuntime.states[elementId];
          state.animationRuntime.states[elementId] = {
            currentClip: existing?.currentClip,
            frameIndex,
            lastTickMs: existing?.lastTickMs ?? 0,
            paused: existing?.paused ?? false,
          };
        });
      },
      setAnimationClip: (elementId, clipName) => {
        set((state) => {
          const existing = state.animationRuntime.states[elementId];
          state.animationRuntime.states[elementId] = {
            currentClip: clipName,
            frameIndex: existing?.frameIndex ?? 0,
            lastTickMs: existing?.lastTickMs ?? 0,
            paused: existing?.paused ?? false,
          };
        });
      },
      pauseAnimation: (elementId, paused) => {
        set((state) => {
          const existing = state.animationRuntime.states[elementId];
          state.animationRuntime.states[elementId] = {
            currentClip: existing?.currentClip,
            frameIndex: existing?.frameIndex ?? 0,
            lastTickMs: existing?.lastTickMs ?? 0,
            paused,
          };
        });
      },
      resetAnimationRuntime: () => {
        set((state) => {
          state.animationRuntime = { states: {} };
        });
      },

      // STORE-03 — Atomic asset → sprite creation in a single undo entry.
      // Reference impl: addSpriteFromAsset (above). Per RESEARCH.md Pitfall 4,
      // ALL state mutations MUST live inside ONE set() call so zundo records
      // a single history entry. One Ctrl+Z undoes both the element creation
      // and the assetId linkage.
      //
      // Decision A2: "asset registration" today = setting `assetId` on the
      // sprite element (the SpriteElementSchema field). There is no separate
      // per-scene asset registry. If a future plan introduces one, that
      // mutation goes inside the SAME set() block below to preserve atomicity.
      addImageElement: (asset) => {
        const aspect = asset.aspectRatio && asset.aspectRatio > 0 ? asset.aspectRatio : 1;
        const baseSize = 2;
        const width = aspect >= 1 ? baseSize : baseSize * aspect;
        const height = aspect >= 1 ? baseSize / aspect : baseSize;
        const sprite = createSpriteElement({
          name: asset.name?.replace(/\.[a-z0-9]+$/i, '') ?? 'Image',
          width,
          height,
          src: asset.url,
          ...(asset.id ? { assetId: asset.id } : {}),
          ...(asset.frameUrls && asset.frameUrls.length >= 2
            ? {
                frameUrls: asset.frameUrls,
                frameRate: asset.frameRate ?? 8,
                loopMode: 'loop' as const,
              }
            : {}),
        });
        // ONE set() = ONE undo entry (zundo guarantee).
        // Both mutations land atomically.
        set((state) => {
          state.scene.elements[sprite.id] = sprite;
          state.selectedIds = [sprite.id];
        });
        return sprite.id;
      },

      // -------------------------------------------------------------------------
      // SELECT-02..05 — Multi-selection actions (Phase 8). All actions follow the
      // Phase 7 Pitfall 4 atomic-undo contract: each LOGICAL change = exactly ONE
      // set() call so zundo records exactly ONE history entry per call.
      // -------------------------------------------------------------------------

      // SELECT-03 / SELECT-04 — Replace selection wholesale.
      setSelectedIds: (ids) => {
        set((state) => {
          state.selectedIds = ids;
        });
      },

      // SELECT-03 / SELECT-04 — Shift+click toggle: add if absent, remove if present.
      toggleSelection: (id) => {
        set((state) => {
          const idx = state.selectedIds.indexOf(id);
          if (idx === -1) {
            state.selectedIds.push(id);
          } else {
            state.selectedIds.splice(idx, 1);
          }
        });
      },

      // SELECT-03 — Esc / empty-canvas click clears the selection.
      clearSelection: () => {
        set((state) => {
          state.selectedIds = [];
        });
      },

      // SELECT-02 — Hover transition. Each <Selectable> writes via this on
      // onPointerOver / onPointerOut. The component-level guard prevents one
      // element clobbering another's hover during rapid transitions
      // (`if (s.hoveredId === id) s.setHovered(null)` inside onPointerOut).
      setHovered: (id) => {
        set((state) => {
          state.hoveredId = id;
        });
      },

      // SELECT-03 — Marquee live-highlight slice. ALWAYS replace wholesale
      // (per Pitfall 7: Immer treats Sets as opaque; in-place mutation may
      // not register as a change for subscribers).
      setMarqueeHoverIds: (ids) => {
        set((state) => {
          state.marqueeHoverIds = new Set(ids);
        });
      },

      clearMarqueeHoverIds: () => {
        set((state) => {
          state.marqueeHoverIds = new Set();
        });
      },

      // SELECT-03 (B5 fix) — Marquee rect transient slice. MarqueeDom writes on
      // pointermove; MarqueeMath reads and computes hits inside <Canvas>. Set to
      // null on pointerup or when drag is below threshold.
      setMarqueeRect: (rect) => {
        set((state) => {
          state.marqueeRect = rect;
        });
      },

      // SELECT-05 — Atomic multi-element nudge. ALL N transform mutations live
      // inside ONE set() call so zundo records EXACTLY ONE history entry per
      // arrow press regardless of selection size.
      //
      // Pixel-art snap: when scene.settings.pixelArtMode === true, post-nudge
      // x/y are integer-rounded. The schema field doesn't exist yet (Phase 14
      // lands PIXEL-01); we read via narrow cast with `?? false` per RESEARCH Q6.
      //
      // dx/dy are deltas in world units. The keyboard hook supplies +1/-1 (Arrow)
      // or +10/-10 (Shift+Arrow); pixel-art mode does NOT change the step size,
      // only the post-nudge rounding.
      nudgeSelection: (dx, dy) => {
        set((state) => {
          const pixelArt = (state.scene.settings as { pixelArtMode?: boolean }).pixelArtMode ?? false;
          for (const id of state.selectedIds) {
            const el = state.scene.elements[id];
            if (!el) continue;
            el.transform.position.x += dx;
            el.transform.position.y += dy;
            if (pixelArt) {
              el.transform.position.x = Math.round(el.transform.position.x);
              el.transform.position.y = Math.round(el.transform.position.y);
            }
          }
        });
      },
    })),
    {
      partialize: (state) => ({ scene: state.scene }),
      limit: 100,
    },
  ),
);
