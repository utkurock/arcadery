'use client';

import { useEffect, useRef } from 'react';
import { Application, Graphics, Text as PixiText, TextStyle, Container, Sprite, Assets, Texture, Rectangle, type Texture as PixiTexture } from 'pixi.js';
import { BehaviorRuntime, type RuntimeState } from '../runtime/behavior-runtime';
import type { GameScene } from '@arcadery/shared';

interface PixiElement {
  id: string;
  name: string;
  type: string;
  transform: {
    position: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  };
  visible: boolean;
  size?: { x: number; y: number; z: number };
  radius?: number;
  material?: { color: string; opacity: number };
  content?: string;
  fontSize?: number;
  color?: string;
  src?: string;
  width?: number;
  height?: number;
  tint?: string;
  assetPack?: string;
  assetCategory?: string;
  assetIndex?: number;
  // Tilemap fields
  tileSize?: number;
  gridCols?: number;
  gridRows?: number;
  renderSize?: number;
  fill?: number;
  // Length is validated upstream by zod (`z.array(z.number()).length(3)`),
  // but we keep this as `number[][]` here so the type lines up with what the
  // editor store and shared schema actually emit. Destructure positionally.
  tiles?: number[][];
}

// Tileset metadata for asset packs (mirrors asset-packs.ts on the server)
interface TilesetDef {
  url: string;
  cols: number;
  rows: number;
  tileSize: number;
  spacing: number;
}

const TILESETS: Record<string, Record<string, TilesetDef>> = {
  'desert-shooter': {
    tiles: { url: '/desertshooterpack/PNG/Tiles/Tilemap/tilemap_packed.png', cols: 18, rows: 13, tileSize: 16, spacing: 0 },
    players: { url: '/desertshooterpack/PNG/Players/Tilemap/tilemap_packed.png', cols: 4, rows: 4, tileSize: 16, spacing: 0 },
    enemies: { url: '/desertshooterpack/PNG/Enemies/Tilemap/tilemap_packed.png', cols: 4, rows: 4, tileSize: 16, spacing: 0 },
    weapons: { url: '/desertshooterpack/PNG/Weapons/Tilemap/tilemap_packed.png', cols: 4, rows: 4, tileSize: 16, spacing: 0 },
  },
};

// Cache of tileset textures sliced into per-tile frames
const tileFrameCache = new Map<string, PixiTexture[]>();

async function getTileFrames(tileset: TilesetDef): Promise<PixiTexture[]> {
  const cached = tileFrameCache.get(tileset.url);
  if (cached) return cached;

  const base = await Assets.load(tileset.url);
  const frames: PixiTexture[] = [];
  const { cols, rows, tileSize, spacing } = tileset;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * (tileSize + spacing);
      const y = row * (tileSize + spacing);
      const frame = new Texture({
        source: base.source,
        frame: new Rectangle(x, y, tileSize, tileSize),
      });
      frames.push(frame);
    }
  }

  tileFrameCache.set(tileset.url, frames);
  return frames;
}

// Resolve asset pack sprite to URL
function resolveAssetUrl(el: PixiElement): string | null {
  if (el.src) return el.src;
  if (el.assetPack && el.assetCategory && typeof el.assetIndex === 'number') {
    const idx = String(el.assetIndex).padStart(4, '0');
    // Hardcoded path for now — matches the manifest
    if (el.assetPack === 'desert-shooter') {
      const cats: Record<string, string> = {
        players: '/desertshooterpack/PNG/Players/Tiles',
        enemies: '/desertshooterpack/PNG/Enemies/Tiles',
        tiles: '/desertshooterpack/PNG/Tiles/Tiles',
        weapons: '/desertshooterpack/PNG/Weapons/Tiles',
        interface: '/desertshooterpack/PNG/Interface/Tiles',
      };
      const base = cats[el.assetCategory];
      if (base) return `${base}/tile_${idx}.png`;
    }
  }
  return null;
}

interface PhaserCanvasProps {
  elements: Record<string, PixiElement>;
  backgroundColor?: string;
  width?: number;
  height?: number;
  isEditMode?: boolean;
  onSelectElement?: (id: string | null) => void;
  selectedId?: string | null;
  paintTile?: { assetPack: string; assetCategory: string; assetIndex: number } | null;
  onPaintCell?: (elementId: string, row: number, col: number, tileIndex: number) => void;
  onEraseCell?: (elementId: string, row: number, col: number) => void;
  /**
   * Full scene — when provided in play mode and scene.gameState exists, the
   * BehaviorRuntime takes over and steps physics + input every frame.
   */
  scene?: GameScene;
  /** Callback fired each frame in play mode with the current runtime state. */
  onGameStateChange?: (state: RuntimeState) => void;
}

function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export function PhaserCanvas({
  elements, backgroundColor, isEditMode = true, onSelectElement,
  selectedId, paintTile, onPaintCell, onEraseCell,
  scene, onGameStateChange,
}: PhaserCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const objectsRef = useRef<Map<string, Container>>(new Map());
  const isDraggingRef = useRef(false);
  const isErasingRef = useRef(false);
  const runtimeRef = useRef<BehaviorRuntime | null>(null);
  /** Elements spawned at runtime (projectiles, future spawner outputs). Kept
   *  separately from prop `elements` so React doesn't have to round-trip them. */
  const dynamicElementsRef = useRef<Map<string, PixiElement>>(new Map());
  const onGameStateChangeRef = useRef(onGameStateChange);
  useEffect(() => {
    onGameStateChangeRef.current = onGameStateChange;
  }, [onGameStateChange]);

  // Latest props for closures inside PIXI event handlers
  const propsRef = useRef({ selectedId, paintTile, elements, onPaintCell, onEraseCell });
  useEffect(() => {
    propsRef.current = { selectedId, paintTile, elements, onPaintCell, onEraseCell };
  }, [selectedId, paintTile, elements, onPaintCell, onEraseCell]);

  // Convert canvas coordinates to grid cell for the selected tilemap
  function canvasToGridCell(clientX: number, clientY: number): { row: number; col: number; elementId: string } | null {
    const app = appRef.current;
    if (!app) return null;
    const { selectedId, elements } = propsRef.current;
    if (!selectedId) return null;
    const el = elements[selectedId];
    if (!el || el.type !== 'tilemap') return null;

    const container = objectsRef.current.get(selectedId);
    if (!container) return null;

    const rect = app.canvas.getBoundingClientRect();
    const localX = ((clientX - rect.left) / rect.width) * app.screen.width;
    const localY = ((clientY - rect.top) / rect.height) * app.screen.height;

    const renderSize = el.renderSize || 32;
    const cols = el.gridCols || 20;
    const rows = el.gridRows || 15;
    const totalW = cols * renderSize;
    const totalH = rows * renderSize;
    const originX = container.x - totalW / 2;
    const originY = container.y - totalH / 2;

    const col = Math.floor((localX - originX) / renderSize);
    const row = Math.floor((localY - originY) / renderSize);

    if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
    return { row, col, elementId: selectedId };
  }

  function handlePointerDown(e: PointerEvent) {
    const { paintTile, onPaintCell, onEraseCell } = propsRef.current;
    if (!paintTile) return;
    const cell = canvasToGridCell(e.clientX, e.clientY);
    if (!cell) return;
    e.preventDefault();

    if (e.button === 2 || e.shiftKey) {
      isErasingRef.current = true;
      onEraseCell?.(cell.elementId, cell.row, cell.col);
    } else {
      isDraggingRef.current = true;
      onPaintCell?.(cell.elementId, cell.row, cell.col, paintTile.assetIndex);
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDraggingRef.current && !isErasingRef.current) return;
    const { paintTile, onPaintCell, onEraseCell } = propsRef.current;
    if (!paintTile) return;
    const cell = canvasToGridCell(e.clientX, e.clientY);
    if (!cell) return;

    if (isErasingRef.current) {
      onEraseCell?.(cell.elementId, cell.row, cell.col);
    } else {
      onPaintCell?.(cell.elementId, cell.row, cell.col, paintTile.assetIndex);
    }
  }

  function handlePointerUp() {
    isDraggingRef.current = false;
    isErasingRef.current = false;
  }

  useEffect(() => {
    if (!containerRef.current || appRef.current) return;

    const app = new Application();
    // Cancellation flag for the async init race. React StrictMode (and even
    // ordinary unmount during Fast Refresh) can run the cleanup before
    // `app.init` resolves; without this guard:
    //   • `containerRef.current!.appendChild` crashes (containerRef is null)
    //   • `app.destroy()` is called on a half-initialized PIXI app
    //   • `app.canvas` is read from undefined in the cleanup branch
    let cancelled = false;
    let initialized = false;

    const init = async () => {
      try {
        await app.init({
          resizeTo: containerRef.current ?? undefined,
          backgroundColor: hexToNumber(backgroundColor || '#17181e'),
          antialias: true,
        });
      } catch {
        // PIXI failed to init (lost WebGL context, SSR-leftover, etc.).
        // Skip everything downstream so cleanup doesn't try to destroy.
        return;
      }
      // Component was unmounted before init completed. Tear down the half-built
      // app right here — the useEffect cleanup already ran and bailed out.
      if (cancelled || !containerRef.current) {
        try { app.destroy(true, { children: true }); } catch {}
        return;
      }
      containerRef.current.appendChild(app.canvas);
      appRef.current = app;
      initialized = true;

      app.canvas.addEventListener('pointerdown', handlePointerDown);
      app.canvas.addEventListener('pointermove', handlePointerMove);
      app.canvas.addEventListener('pointerup', handlePointerUp);
      app.canvas.addEventListener('pointerleave', handlePointerUp);
      app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      syncElements();
    };
    init();

    return () => {
      cancelled = true;
      // Only touch the app if init actually completed — otherwise we'd be
      // destroying a PIXI instance that never finished constructing, which
      // throws "Cannot read properties of undefined (reading 'canvas')".
      if (!initialized) return;
      if (app.canvas) {
        app.canvas.removeEventListener('pointerdown', handlePointerDown);
        app.canvas.removeEventListener('pointermove', handlePointerMove);
        app.canvas.removeEventListener('pointerup', handlePointerUp);
        app.canvas.removeEventListener('pointerleave', handlePointerUp);
      }
      try { app.destroy(true, { children: true }); } catch {}
      appRef.current = null;
      objectsRef.current.clear();
    };
  }, []);

  // Sync elements on change
  useEffect(() => {
    syncElements();
  }, [elements]);

  // Behavior runtime — only in play mode with a scene that opted-in via gameState
  useEffect(() => {
    if (isEditMode || !scene?.gameState) return;
    const app = appRef.current;
    if (!app) return;

    const runtime = new BehaviorRuntime(scene);
    runtimeRef.current = runtime;
    runtime.start();

    // Pointer = "click" trigger for shoot-projectile.
    const onPointerDown = () => runtime.setPointerActive(true);
    const onPointerUp = () => runtime.setPointerActive(false);
    app.canvas.addEventListener('pointerdown', onPointerDown);
    app.canvas.addEventListener('pointerup', onPointerUp);
    app.canvas.addEventListener('pointerleave', onPointerUp);

    // Esc → toggle pause.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        runtime.togglePause();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    // Floating score popups: Pixi text spawned by score events.
    type Popup = { container: Container; bornMs: number };
    const popups: Popup[] = [];

    const cameraFollowId = scene.gameState.cameraFollowId;

    let lastMs = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = (now - lastMs) / 1000;
      lastMs = now;
      runtime.tick(dt);

      const state = runtime.getState();

      // Camera follow — pan the entire stage so the followed element sits at
      // screen center. Lazy lerp so motion stays smooth.
      if (cameraFollowId && state.positions[cameraFollowId]?.alive) {
        const target = state.positions[cameraFollowId];
        const desiredX = app.screen.width / 2 - target.x;
        const desiredY = app.screen.height / 2 - (app.screen.height - target.y);
        // Lerp 15% per frame for smoothing
        app.stage.x += (desiredX - app.stage.x) * 0.15;
        app.stage.y += (desiredY - app.stage.y) * 0.15;
      }

      // Pull in any newly-spawned elements (projectiles, future spawner output)
      // and re-run syncElements so they actually get rendered.
      if (state.spawnedElements.length > 0) {
        for (const { id, element } of state.spawnedElements) {
          dynamicElementsRef.current.set(id, element as unknown as PixiElement);
        }
        syncElements();
      }

      // Spawn score popup texts at the pickup's world position.
      for (const popup of state.scorePopups) {
        const style = new TextStyle({
          fontSize: 22,
          fill: popup.delta > 0 ? '#fbbf24' : '#ef4444',
          fontFamily: 'Arial',
          fontWeight: '900',
        });
        const t = new PixiText({
          text: `${popup.delta > 0 ? '+' : ''}${popup.delta}`,
          style,
        });
        t.anchor.set(0.5);
        const c = new Container();
        c.addChild(t);
        c.x = popup.x;
        c.y = app.screen.height - popup.y;
        app.stage.addChild(c);
        popups.push({ container: c, bornMs: performance.now() });
      }

      // Animate active popups (rise + fade), retire after 800ms
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        const age = performance.now() - p.bornMs;
        if (age >= 800) {
          app.stage.removeChild(p.container);
          p.container.destroy();
          popups.splice(i, 1);
          continue;
        }
        p.container.y -= 30 * (1 / 60); // ~30 px/sec rise
        p.container.alpha = 1 - age / 800;
      }

      for (const [id, p] of Object.entries(state.positions)) {
        const container = objectsRef.current.get(id);
        if (!container) continue;
        if (!p.alive) {
          container.visible = false;
          continue;
        }
        container.visible = true;
        container.x = p.x;
        container.y = app.screen.height - p.y;
      }

      // Garbage-collect dynamic elements that have died and aren't expected to revive
      for (const id of dynamicElementsRef.current.keys()) {
        const pos = state.positions[id];
        if (pos && !pos.alive) {
          dynamicElementsRef.current.delete(id);
          const c = objectsRef.current.get(id);
          if (c) {
            app.stage.removeChild(c);
            c.destroy();
            objectsRef.current.delete(id);
          }
        }
      }

      onGameStateChangeRef.current?.(state);
    };

    app.ticker.add(tick);
    return () => {
      app.ticker.remove(tick);
      runtime.stop();
      runtimeRef.current = null;
      dynamicElementsRef.current.clear();
      app.canvas.removeEventListener('pointerdown', onPointerDown);
      app.canvas.removeEventListener('pointerup', onPointerUp);
      app.canvas.removeEventListener('pointerleave', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      for (const p of popups) {
        app.stage.removeChild(p.container);
        p.container.destroy();
      }
      popups.length = 0;
      // Reset stage offset for next mount
      app.stage.x = 0;
      app.stage.y = 0;
    };
  }, [isEditMode, scene]);

  function syncElements() {
    const app = appRef.current;
    if (!app) return;

    // Merge prop elements + runtime-spawned elements into one render set.
    const merged: Record<string, PixiElement> = { ...elements };
    for (const [id, el] of dynamicElementsRef.current) merged[id] = el;
    const currentIds = new Set(Object.keys(merged));

    // Remove old
    for (const [id, obj] of objectsRef.current) {
      if (!currentIds.has(id)) {
        app.stage.removeChild(obj);
        obj.destroy();
        objectsRef.current.delete(id);
      }
    }

    // Add/update
    for (const [id, el] of Object.entries(merged)) {
      if (!el.visible) continue;

      const x = el.transform.position.x;
      const y = app.screen.height - el.transform.position.y; // y-up → y-down
      const scaleX = el.transform.scale.x;
      const scaleY = el.transform.scale.y;
      const color = el.material?.color || el.color || '#ffffff';
      const colorNum = hexToNumber(color);
      const opacity = el.material?.opacity ?? 1;

      let container = objectsRef.current.get(id);

      if (!container) {
        container = new Container();
        container.eventMode = isEditMode ? 'static' : 'none';
        container.cursor = isEditMode ? 'pointer' : 'default';
        if (isEditMode) {
          container.on('pointerdown', () => onSelectElement?.(id));
        }
        app.stage.addChild(container);
        objectsRef.current.set(id, container);
      }

      // Clear children and redraw
      container.removeChildren();
      container.position.set(x, y);
      container.scale.set(scaleX, scaleY);
      container.alpha = opacity;

      if (el.type === 'box' || el.type === 'plane') {
        const w = (el.size?.x || (el.type === 'plane' ? 10 : 1)) * 50;
        const h = (el.size?.y || (el.type === 'plane' ? 10 : 1)) * 50;
        const g = new Graphics();
        g.roundRect(-w / 2, -h / 2, w, h, 4);
        g.fill({ color: colorNum });
        container.addChild(g);
      } else if (el.type === 'sphere') {
        const r = (el.radius || 0.5) * 50;
        const g = new Graphics();
        g.circle(0, 0, r);
        g.fill({ color: colorNum });
        container.addChild(g);
      } else if (el.type === 'text') {
        const style = new TextStyle({
          fontSize: (el.fontSize || 1) * 20,
          fill: el.color || '#ffffff',
          fontFamily: 'Arial',
          align: 'center',
        });
        const t = new PixiText({ text: el.content || 'Text', style });
        t.anchor.set(0.5);
        container.addChild(t);
      } else if (el.type === 'tilemap') {
        // Get tileset for this asset pack
        const packTilesets = el.assetPack ? TILESETS[el.assetPack] : null;
        const tileset = packTilesets?.tiles; // use 'tiles' category by default
        if (tileset) {
          const renderSize = el.renderSize || 32;
          const cols = el.gridCols || 20;
          const rows = el.gridRows || 15;
          const fill = el.fill ?? -1;
          const sparse = el.tiles || [];

          // Build sparse index map
          const sparseMap = new Map<string, number>();
          for (const [r, c, idx] of sparse) {
            sparseMap.set(`${r},${c}`, idx);
          }

          // Load frames and render grid
          getTileFrames(tileset).then((frames) => {
            if (!container || !objectsRef.current.has(id)) return;

            // Center the grid around the element position
            const totalW = cols * renderSize;
            const totalH = rows * renderSize;
            const offsetX = -totalW / 2;
            const offsetY = -totalH / 2;

            for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols; c++) {
                const tileIdx = sparseMap.get(`${r},${c}`) ?? fill;
                if (tileIdx < 0 || tileIdx >= frames.length) continue;
                const frame = frames[tileIdx];
                const sprite = new Sprite(frame);
                sprite.width = renderSize;
                sprite.height = renderSize;
                sprite.x = offsetX + c * renderSize;
                sprite.y = offsetY + r * renderSize;
                container.addChild(sprite);
              }
            }
          }).catch(() => {
            const g = new Graphics();
            g.rect(-50, -50, 100, 100);
            g.fill({ color: 0x333333 });
            container.addChild(g);
          });
        }
      } else if (el.type === 'sprite') {
        // Prefer tileset frame if assetPack + category + index given
        const packTilesets = el.assetPack ? TILESETS[el.assetPack] : null;
        const tileset = packTilesets && el.assetCategory ? packTilesets[el.assetCategory] : null;

        if (tileset && typeof el.assetIndex === 'number') {
          // Use cached frame from shared tileset (single texture for all sprites)
          getTileFrames(tileset).then((frames) => {
            if (!container || !objectsRef.current.has(id)) return;
            const frame = frames[el.assetIndex!];
            if (!frame) return;
            const sprite = new Sprite(frame);
            sprite.anchor.set(0.5);
            const w = (el.width || 1) * 50;
            const h = (el.height || 1) * 50;
            sprite.width = w;
            sprite.height = h;
            if (el.tint) sprite.tint = hexToNumber(el.tint);
            container.addChild(sprite);
          }).catch(() => {});
        } else {
          // Fallback: load individual PNG
          const url = resolveAssetUrl(el);
          if (url) {
            Assets.load(url).then((texture) => {
              if (!container || !objectsRef.current.has(id)) return;
              const sprite = new Sprite(texture);
              sprite.anchor.set(0.5);
              const w = (el.width || 1) * 50;
              const h = (el.height || 1) * 50;
              sprite.width = w;
              sprite.height = h;
              if (el.tint) sprite.tint = hexToNumber(el.tint);
              container.addChild(sprite);
            }).catch(() => {
              const g = new Graphics();
              g.rect(-25, -25, 50, 50);
              g.fill({ color: 0x666666 });
              container.addChild(g);
            });
          }
        }
      }
    }
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
