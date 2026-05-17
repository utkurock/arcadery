import type {
  GameScene,
  SceneElement,
  GameEconomyConfig,
  GameStateConfig,
  DragPayload,
} from '@arcadery/shared';

/**
 * Element attached to the AI chat panel (STORE-01).
 * Set by Phase 9 drag-to-chat; consumed by Phase 10 AICHAT-01/02/03.
 */
export interface ChatAttachment {
  elementId: string;
  elementType: SceneElement['type'];
  name: string;
  thumbnailUrl?: string;
}

/**
 * In-flight canvas-to-chat drag tracking (STORE-01, DRAG-03).
 * Set on pointer-capture by Phase 9; cleared on pointerup or Esc.
 */
export interface DragFromCanvas {
  elementId: string;
  startedAt: number;
  pointerStart: { x: number; y: number };
}

/**
 * Drop-site landing data (STORE-01, DRAG-01/03).
 * `worldPosition` is set by the drop target on pointerup via elementFromPoint
 * (Phase 9 wires the lifecycle).
 */
export interface PendingDrop {
  payload: DragPayload;
  worldPosition?: { x: number; y: number; z: number };
}

/**
 * Per-sprite-element animation playback state (STORE-01, ANIM-01/03).
 * Phase 12 reads these to drive AnimatedSprite rendering. Keeping it flat at
 * the root (NOT inside scene) so it's excluded from undo history.
 */
export interface AnimationRuntimeState {
  currentClip?: string;
  frameIndex: number;
  lastTickMs: number;
  paused: boolean;
}

export interface AnimationRuntime {
  states: Record<string, AnimationRuntimeState>;
}

export interface EditorState {
  scene: GameScene;
  mode: 'edit' | 'play';

  // Scene actions
  addElement: (element: SceneElement) => void;
  addSpriteFromAsset: (asset: {
    id?: string;
    url: string;
    name?: string;
    frameUrls?: string[];
    frameRate?: number;
    aspectRatio?: number;
  }) => string;

  addModelFromAsset: (asset: {
    id?: string;
    url: string;
    name?: string;
  }) => string;

  // Context menu target — viewport sets when user right-clicks an element.
  contextMenuTarget: { elementId: string; x: number; y: number } | null;
  openContextMenu: (target: { elementId: string; x: number; y: number }) => void;
  closeContextMenu: () => void;

  // Replace the asset linkage of an existing sprite (e.g. after AI modify).
  swapSpriteAsset: (
    elementId: string,
    asset: {
      id?: string;
      url: string;
      frameUrls?: string[];
      frameRate?: number;
    },
  ) => void;
  removeElement: (id: string) => void;
  updateElement: (id: string, patch: Partial<SceneElement>) => void;
  updateElementTransform: (
    id: string,
    transform: Partial<{
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number };
      scale: { x: number; y: number; z: number };
    }>,
  ) => void;

  // Transform mode. `select` is the default cursor tool — no gizmo handles,
  // just click-to-select and click-drag-to-move freely in the screen plane.
  // The other three show axis-locked TransformControls handles.
  transformMode: 'select' | 'translate' | 'rotate' | 'scale';
  setTransformMode: (mode: 'select' | 'translate' | 'rotate' | 'scale') => void;

  // Mode
  setMode: (mode: 'edit' | 'play') => void;

  // View mode (2D/3D)
  viewMode: '2d' | '3d';
  setViewMode: (mode: '2d' | '3d') => void;

  // Scene management
  loadScene: (scene: GameScene) => void;
  setSceneName: (name: string) => void;
  setRenderEngine: (engine: 'three' | 'phaser') => void;
  setEconomy: (economy: GameEconomyConfig) => void;
  setGameState: (config: GameStateConfig | undefined) => void;
  updateSceneSettings: (patch: Partial<GameScene['settings']>) => void;

  // Tile painting (Unity-like)
  paintTile: { assetPack: string; assetCategory: string; assetIndex: number } | null;
  setPaintTile: (tile: { assetPack: string; assetCategory: string; assetIndex: number } | null) => void;
  paintTileAt: (elementId: string, row: number, col: number, tileIndex: number) => void;
  erasePaintAt: (elementId: string, row: number, col: number) => void;

  // NEW (STORE-01) — Chat attachment slice.
  // Flat-root placement is intentional: partialize at editor-store.ts:217 returns
  // only `{ scene: state.scene }`, so anything outside `state.scene` is auto-
  // excluded from zundo undo history (STORE-02).
  chatAttachment: ChatAttachment | null;
  setChatAttachment: (attachment: ChatAttachment | null) => void;
  clearChatAttachment: () => void;

  // NEW (STORE-01) — Drag-from-canvas slice.
  dragFromCanvas: DragFromCanvas | null;
  startDragFromCanvas: (drag: DragFromCanvas) => void;
  endDragFromCanvas: () => void;

  // NEW (STORE-01) — Pending-drop slice.
  pendingDrop: PendingDrop | null;
  setPendingDrop: (drop: PendingDrop | null) => void;
  clearPendingDrop: () => void;

  // NEW (STORE-01) — Animation runtime slice.
  animationRuntime: AnimationRuntime;
  setAnimationFrame: (elementId: string, frameIndex: number) => void;
  setAnimationClip: (elementId: string, clipName: string) => void;
  pauseAnimation: (elementId: string, paused: boolean) => void;
  resetAnimationRuntime: () => void;

  // NEW (STORE-03) — Atomic asset → sprite creation in a single undo entry.
  // Used by Phase 11 (AICANVAS-01) when AI image output drops onto the canvas.
  // Implementation MUST perform all mutations inside ONE set() call so zundo
  // records a single history entry — one Ctrl+Z undoes both the element and
  // the assetId linkage. See 07-RESEARCH.md Pitfall 4.
  addImageElement: (asset: {
    id?: string;
    url: string;
    name?: string;
    frameUrls?: string[];
    frameRate?: number;
    aspectRatio?: number;
  }) => string;

  // NEW (Phase 8 SELECT-01..05) — Multi-selection.
  // Replaces the legacy single-selection field (`string | null`) of Phase 2.
  // Array (not Set) per RESEARCH Q1: Immer treats Sets as opaque, and a string[]
  // is structurally diffed and serializable should partialize ever change.
  // Membership: selectedIds.includes(id). For "the focused element" (single-
  // selection consumers like the property panel), read `selectedIds[0] ?? null`.
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;

  // NEW (Phase 8 SELECT-02) — Hover state for the unified <Selectable> wrapper.
  // Single store value rather than per-element local state so cursor enter/leave
  // transitions are atomic (entering element B clobbers leaving element A).
  hoveredId: string | null;
  setHovered: (id: string | null) => void;

  // NEW (Phase 8 SELECT-03) — Marquee live-highlight transient slice.
  // While the marquee rect drags, the handler computes the would-be-selected
  // ids and writes them here. <Selectable> reads it for its hover ring.
  // On pointerup, the set is committed via setSelectedIds(...) and cleared.
  // Flat-root placement (NOT nested under scene) auto-excludes from undo
  // history per Phase 7 Pattern 4 (partialize returns only `{ scene }`).
  // ALWAYS replace the Set wholesale (`new Set(ids)`) — never mutate in place
  // (Immer treats Sets as opaque; in-place mutation may not register as change).
  marqueeHoverIds: Set<string>;
  setMarqueeHoverIds: (ids: Set<string>) => void;
  clearMarqueeHoverIds: () => void;

  // NEW (Phase 8 SELECT-03 — B5 fix) — Marquee rect transient slice.
  // The marquee is split across two components per BLOCKER 5: MarqueeDom
  // (lives outside <Canvas>, owns pointer handlers, renders the brand-purple
  // DOM rectangle) and MarqueeMath (lives inside <Canvas>, owns useThree-
  // dependent computeMarqueeHits, writes marqueeHoverIds). They communicate
  // via this shared transient slice. Flat-root placement excludes from undo.
  // null when no drag is active.
  marqueeRect: { x: number; y: number; w: number; h: number } | null;
  setMarqueeRect: (rect: { x: number; y: number; w: number; h: number } | null) => void;

  // NEW (Phase 8 SELECT-05) — Atomic multi-element nudge.
  // ALL N selected element transforms mutate inside ONE set() call so zundo
  // records EXACTLY ONE history entry per arrow press, even with N>1 selected.
  // Mirror of Phase 7 Pitfall 4 (addImageElement reference impl).
  // dx/dy units = world units (1 wu ≈ 1 screen px @ default zoom).
  // When (scene.settings as any).pixelArtMode === true, post-nudge positions
  // are Math.round()'d on x and y. Phase 14 lands the schema field; Phase 8
  // reads the loose property today.
  nudgeSelection: (dx: number, dy: number) => void;
}
