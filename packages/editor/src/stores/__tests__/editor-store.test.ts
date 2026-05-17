import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editor-store';
import { createEmptyScene, createBoxElement, createSpriteElement } from '@arcadery/shared';

beforeEach(() => {
  // Reset store between tests
  useEditorStore.setState({
    scene: createEmptyScene(),
    selectedIds: [],
    hoveredId: null,
    marqueeHoverIds: new Set<string>(),
    marqueeRect: null,
    mode: 'edit',
    transformMode: 'translate',
    viewMode: '3d',
    contextMenuTarget: null,
    paintTile: null,
    chatAttachment: null,
    dragFromCanvas: null,
    pendingDrop: null,
    animationRuntime: { states: {} },
  });
  // Clear undo history
  useEditorStore.temporal.getState().clear();
});

describe('addElement', () => {
  it('adds element to scene.elements keyed by id', () => {
    const box = createBoxElement({ name: 'TestBox' });
    useEditorStore.getState().addElement(box);
    const el = useEditorStore.getState().scene.elements[box.id];
    expect(el).toBeDefined();
    expect(el.name).toBe('TestBox');
    expect(el.type).toBe('box');
  });
});

describe('removeElement', () => {
  it('removes element and clears selection if selected', () => {
    const box = createBoxElement();
    useEditorStore.getState().addElement(box);
    useEditorStore.getState().setSelectedIds([box.id]);
    expect(useEditorStore.getState().selectedIds).toEqual([box.id]);
    useEditorStore.getState().removeElement(box.id);
    expect(useEditorStore.getState().scene.elements[box.id]).toBeUndefined();
    expect(useEditorStore.getState().selectedIds).toEqual([]);
  });
});

describe('updateElement', () => {
  it('updates element fields', () => {
    const box = createBoxElement();
    useEditorStore.getState().addElement(box);
    useEditorStore.getState().updateElement(box.id, { name: 'Renamed' });
    expect(useEditorStore.getState().scene.elements[box.id].name).toBe('Renamed');
  });
});

describe('updateElementTransform', () => {
  it('updates position without clobbering rotation/scale', () => {
    const box = createBoxElement();
    useEditorStore.getState().addElement(box);
    useEditorStore.getState().updateElementTransform(box.id, {
      position: { x: 5, y: 0, z: 0 },
    });
    const el = useEditorStore.getState().scene.elements[box.id];
    expect(el.transform.position.x).toBe(5);
    expect(el.transform.scale.x).toBe(1); // not clobbered
  });
});

describe('hybrid 2D/3D', () => {
  it('holds both sprite and box elements', () => {
    const box = createBoxElement();
    const sprite = createSpriteElement({ src: '/test.png' });
    useEditorStore.getState().addElement(box);
    useEditorStore.getState().addElement(sprite);
    const elements = useEditorStore.getState().scene.elements;
    expect(elements[box.id].type).toBe('box');
    expect(elements[sprite.id].type).toBe('sprite');
  });
});

describe('setTransformMode', () => {
  it('updates transformMode to rotate', () => {
    useEditorStore.getState().setTransformMode('rotate');
    expect(useEditorStore.getState().transformMode).toBe('rotate');
  });

  it('updates transformMode to scale', () => {
    useEditorStore.getState().setTransformMode('scale');
    expect(useEditorStore.getState().transformMode).toBe('scale');
  });

  it('defaults to translate', () => {
    expect(useEditorStore.getState().transformMode).toBe('translate');
  });
});

describe('setMode', () => {
  it('updates mode to play', () => {
    useEditorStore.getState().setMode('play');
    expect(useEditorStore.getState().mode).toBe('play');
  });

  it('restores mode to edit', () => {
    useEditorStore.getState().setMode('play');
    useEditorStore.getState().setMode('edit');
    expect(useEditorStore.getState().mode).toBe('edit');
  });
});

describe('undo/redo', () => {
  it('undoes addElement', () => {
    const box = createBoxElement();
    useEditorStore.getState().addElement(box);
    expect(Object.keys(useEditorStore.getState().scene.elements)).toHaveLength(1);
    useEditorStore.temporal.getState().undo();
    expect(Object.keys(useEditorStore.getState().scene.elements)).toHaveLength(0);
  });

  it('does NOT undo selection changes', () => {
    const box = createBoxElement();
    useEditorStore.getState().addElement(box);
    useEditorStore.getState().setSelectedIds([box.id]);
    useEditorStore.temporal.getState().undo();
    // Undo restores scene only, so selectedIds remains
    expect(useEditorStore.getState().selectedIds).toEqual([box.id]);
  });

  it('redo restores after undo', () => {
    const box = createBoxElement();
    useEditorStore.getState().addElement(box);
    useEditorStore.temporal.getState().undo();
    useEditorStore.temporal.getState().redo();
    expect(Object.keys(useEditorStore.getState().scene.elements)).toHaveLength(1);
  });
});

// ----- STORE-01: slice initial values + setters -----

describe('chatAttachment slice (STORE-01)', () => {
  it('initial value is null', () => {
    expect(useEditorStore.getState().chatAttachment).toBeNull();
  });
  it('setChatAttachment sets the slice', () => {
    useEditorStore.getState().setChatAttachment({
      elementId: 'e-1',
      elementType: 'sprite',
      name: 'Hero',
    });
    expect(useEditorStore.getState().chatAttachment?.elementId).toBe('e-1');
  });
  it('clearChatAttachment returns slice to null', () => {
    useEditorStore.getState().setChatAttachment({
      elementId: 'e-1',
      elementType: 'sprite',
      name: 'Hero',
    });
    useEditorStore.getState().clearChatAttachment();
    expect(useEditorStore.getState().chatAttachment).toBeNull();
  });
});

describe('dragFromCanvas slice (STORE-01)', () => {
  it('initial value is null', () => {
    expect(useEditorStore.getState().dragFromCanvas).toBeNull();
  });
  it('startDragFromCanvas sets the slice; endDragFromCanvas clears it', () => {
    useEditorStore.getState().startDragFromCanvas({
      elementId: 'e-1',
      startedAt: 1000,
      pointerStart: { x: 10, y: 20 },
    });
    expect(useEditorStore.getState().dragFromCanvas?.elementId).toBe('e-1');
    useEditorStore.getState().endDragFromCanvas();
    expect(useEditorStore.getState().dragFromCanvas).toBeNull();
  });
});

describe('pendingDrop slice (STORE-01)', () => {
  it('initial value is null', () => {
    expect(useEditorStore.getState().pendingDrop).toBeNull();
  });
  it('setPendingDrop sets the slice', () => {
    useEditorStore.getState().setPendingDrop({
      payload: { kind: 'asset', assetId: 'a-1', url: '/a.png', name: 'A' },
      worldPosition: { x: 0, y: 0, z: 0 },
    });
    expect(useEditorStore.getState().pendingDrop?.payload.kind).toBe('asset');
  });
  it('clearPendingDrop returns slice to null', () => {
    useEditorStore.getState().setPendingDrop({
      payload: { kind: 'asset', assetId: 'a-1', url: '/a.png', name: 'A' },
    });
    useEditorStore.getState().clearPendingDrop();
    expect(useEditorStore.getState().pendingDrop).toBeNull();
  });
});

describe('animationRuntime slice (STORE-01)', () => {
  it('initial value is { states: {} }', () => {
    expect(useEditorStore.getState().animationRuntime).toEqual({ states: {} });
  });
  it('setAnimationFrame upserts a state entry', () => {
    useEditorStore.getState().setAnimationFrame('e-1', 3);
    expect(useEditorStore.getState().animationRuntime.states['e-1'].frameIndex).toBe(3);
  });
  it('setAnimationClip preserves frameIndex if already present', () => {
    useEditorStore.getState().setAnimationFrame('e-1', 5);
    useEditorStore.getState().setAnimationClip('e-1', 'run');
    const s = useEditorStore.getState().animationRuntime.states['e-1'];
    expect(s.currentClip).toBe('run');
    expect(s.frameIndex).toBe(5);
  });
  it('pauseAnimation flips paused without dropping other fields', () => {
    useEditorStore.getState().setAnimationClip('e-1', 'idle');
    useEditorStore.getState().pauseAnimation('e-1', true);
    expect(useEditorStore.getState().animationRuntime.states['e-1'].paused).toBe(true);
    expect(useEditorStore.getState().animationRuntime.states['e-1'].currentClip).toBe('idle');
  });
  it('resetAnimationRuntime clears all entries', () => {
    useEditorStore.getState().setAnimationFrame('e-1', 1);
    useEditorStore.getState().setAnimationFrame('e-2', 2);
    useEditorStore.getState().resetAnimationRuntime();
    expect(useEditorStore.getState().animationRuntime).toEqual({ states: {} });
  });
});

// ----- STORE-02: ephemeral slices excluded from undo -----

describe('ephemeral slices excluded from undo (STORE-02)', () => {
  it('undo does NOT clear chatAttachment', () => {
    const box = createBoxElement();
    useEditorStore.getState().addElement(box);
    useEditorStore.getState().setChatAttachment({
      elementId: box.id,
      elementType: 'box',
      name: 'Box',
    });
    useEditorStore.temporal.getState().undo(); // undoes addElement
    expect(useEditorStore.getState().chatAttachment).not.toBeNull();
    expect(useEditorStore.getState().chatAttachment?.elementId).toBe(box.id);
  });

  it('undo does NOT clear dragFromCanvas', () => {
    const box = createBoxElement();
    useEditorStore.getState().addElement(box);
    useEditorStore.getState().startDragFromCanvas({
      elementId: box.id,
      startedAt: Date.now(),
      pointerStart: { x: 0, y: 0 },
    });
    useEditorStore.temporal.getState().undo();
    expect(useEditorStore.getState().dragFromCanvas).not.toBeNull();
  });

  it('undo does NOT clear pendingDrop', () => {
    const box = createBoxElement();
    useEditorStore.getState().addElement(box);
    useEditorStore.getState().setPendingDrop({
      payload: { kind: 'asset', assetId: 'a-1', url: '/a.png', name: 'A' },
    });
    useEditorStore.temporal.getState().undo();
    expect(useEditorStore.getState().pendingDrop).not.toBeNull();
  });

  it('undo does NOT clear animationRuntime', () => {
    const box = createBoxElement();
    useEditorStore.getState().addElement(box);
    useEditorStore.getState().setAnimationClip(box.id, 'idle');
    useEditorStore.temporal.getState().undo();
    expect(useEditorStore.getState().animationRuntime.states[box.id]?.currentClip).toBe('idle');
  });
});

// ----- STORE-03: atomic addImageElement -----

describe('addImageElement atomic undo (STORE-03)', () => {
  it('creates element and sets selectedIds in one call, returns id', () => {
    // assetId on the sprite schema is z.string().uuid().optional() — use a real UUID.
    const id = useEditorStore.getState().addImageElement({
      id: '123e4567-e89b-12d3-a456-426614174000',
      url: '/img.png',
      name: 'Hero.png',
    });
    const el = useEditorStore.getState().scene.elements[id];
    expect(el).toBeDefined();
    expect(el.type).toBe('sprite');
    // Strip extension on name (matches addSpriteFromAsset behavior).
    expect(el.name).toBe('Hero');
    expect((el as { assetId?: string }).assetId).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect((el as { src?: string }).src).toBe('/img.png');
    expect(useEditorStore.getState().selectedIds).toEqual([id]);
  });

  it('one undo removes both element and assetId linkage atomically', () => {
    const id = useEditorStore.getState().addImageElement({
      id: '123e4567-e89b-12d3-a456-426614174000',
      url: '/img.png',
      name: 'Hero',
    });
    expect(useEditorStore.getState().scene.elements[id]).toBeDefined();
    useEditorStore.temporal.getState().undo();
    // The whole sprite (including its assetId) is gone — ONE undo, not two.
    expect(useEditorStore.getState().scene.elements[id]).toBeUndefined();
  });

  it('works without asset.id (no assetId on sprite)', () => {
    const id = useEditorStore.getState().addImageElement({
      url: '/img.png',
      name: 'Anon',
    });
    const el = useEditorStore.getState().scene.elements[id] as {
      assetId?: string;
      src?: string;
    };
    expect(el).toBeDefined();
    expect(el.assetId).toBeUndefined();
    expect(el.src).toBe('/img.png');
  });

  it('honors aspectRatio for sizing', () => {
    const wideId = useEditorStore.getState().addImageElement({
      url: '/wide.png',
      aspectRatio: 2,
    });
    const wide = useEditorStore.getState().scene.elements[wideId] as {
      width: number;
      height: number;
    };
    expect(wide.width).toBe(2);
    expect(wide.height).toBe(1);

    const tallId = useEditorStore.getState().addImageElement({
      url: '/tall.png',
      aspectRatio: 0.5,
    });
    const tall = useEditorStore.getState().scene.elements[tallId] as {
      width: number;
      height: number;
    };
    expect(tall.width).toBe(1);
    expect(tall.height).toBe(2);
  });

  it('attaches frameUrls + loopMode when frameUrls.length >= 2', () => {
    const id = useEditorStore.getState().addImageElement({
      url: '/img.png',
      frameUrls: ['/f1.png', '/f2.png', '/f3.png'],
      frameRate: 12,
    });
    const el = useEditorStore.getState().scene.elements[id] as {
      frameUrls?: string[];
      frameRate?: number;
      loopMode?: string;
    };
    expect(el.frameUrls).toEqual(['/f1.png', '/f2.png', '/f3.png']);
    expect(el.frameRate).toBe(12);
    expect(el.loopMode).toBe('loop');
  });
});

// ----- Phase 8 Wave 1 (08-02): selection actions, hover, marquee, nudge -----

describe('Phase 8 — selection actions (SELECT-02 / SELECT-03 / SELECT-04)', () => {
  it('setSelectedIds replaces selection wholesale', () => {
    const a = createBoxElement({ name: 'A' });
    const b = createBoxElement({ name: 'B' });
    useEditorStore.getState().addElement(a);
    useEditorStore.getState().addElement(b);
    useEditorStore.getState().setSelectedIds([a.id]);
    expect(useEditorStore.getState().selectedIds).toEqual([a.id]);
    useEditorStore.getState().setSelectedIds([b.id]);
    expect(useEditorStore.getState().selectedIds).toEqual([b.id]);
  });

  it('toggleSelection adds id when absent, removes when present', () => {
    const a = createBoxElement();
    useEditorStore.getState().addElement(a);
    useEditorStore.getState().toggleSelection(a.id);
    expect(useEditorStore.getState().selectedIds).toEqual([a.id]);
    useEditorStore.getState().toggleSelection(a.id);
    expect(useEditorStore.getState().selectedIds).toEqual([]);
  });

  it('clearSelection empties selectedIds', () => {
    const a = createBoxElement();
    useEditorStore.getState().addElement(a);
    useEditorStore.getState().setSelectedIds([a.id]);
    useEditorStore.getState().clearSelection();
    expect(useEditorStore.getState().selectedIds).toEqual([]);
  });

  it('selectAll: setSelectedIds(Object.keys(elements)) selects all', () => {
    const a = createBoxElement();
    const b = createSpriteElement({ name: 'B', src: 'https://example.com/b.png', width: 1, height: 1 });
    useEditorStore.getState().addElement(a);
    useEditorStore.getState().addElement(b);
    const ids = Object.keys(useEditorStore.getState().scene.elements);
    useEditorStore.getState().setSelectedIds(ids);
    expect(useEditorStore.getState().selectedIds.length).toBe(2);
    expect(useEditorStore.getState().selectedIds).toEqual(expect.arrayContaining([a.id, b.id]));
  });
});

describe('Phase 8 — hover state (SELECT-02)', () => {
  it('hover: setHovered toggles hoveredId', () => {
    useEditorStore.getState().setHovered('foo');
    expect(useEditorStore.getState().hoveredId).toBe('foo');
    useEditorStore.getState().setHovered(null);
    expect(useEditorStore.getState().hoveredId).toBeNull();
  });

  it('removeElement clears hoveredId if pointing at deleted element', () => {
    const a = createBoxElement();
    useEditorStore.getState().addElement(a);
    useEditorStore.getState().setHovered(a.id);
    useEditorStore.getState().removeElement(a.id);
    expect(useEditorStore.getState().hoveredId).toBeNull();
  });
});

describe('Phase 8 — marqueeHoverIds (SELECT-03)', () => {
  it('setMarqueeHoverIds replaces wholesale (reference identity changes)', () => {
    const before = useEditorStore.getState().marqueeHoverIds;
    useEditorStore.getState().setMarqueeHoverIds(new Set(['a', 'b']));
    const after = useEditorStore.getState().marqueeHoverIds;
    expect(after).not.toBe(before); // reference identity changed
    expect(after.has('a')).toBe(true);
    expect(after.has('b')).toBe(true);
    expect(after.size).toBe(2);
  });

  it('clearMarqueeHoverIds resets to fresh empty Set', () => {
    useEditorStore.getState().setMarqueeHoverIds(new Set(['a']));
    useEditorStore.getState().clearMarqueeHoverIds();
    expect(useEditorStore.getState().marqueeHoverIds.size).toBe(0);
  });
});

describe('Phase 8 — nudgeSelection (SELECT-05)', () => {
  it('nudge by 1 unit: ArrowUp moves y by +1', () => {
    const a = createBoxElement();
    useEditorStore.getState().addElement(a);
    useEditorStore.getState().setSelectedIds([a.id]);
    const initialY = useEditorStore.getState().scene.elements[a.id].transform.position.y;
    useEditorStore.getState().nudgeSelection(0, 1);
    const finalY = useEditorStore.getState().scene.elements[a.id].transform.position.y;
    expect(finalY - initialY).toBe(1);
  });

  it('nudge by 10 units: Shift+ArrowUp moves y by +10', () => {
    const a = createBoxElement();
    useEditorStore.getState().addElement(a);
    useEditorStore.getState().setSelectedIds([a.id]);
    const initialY = useEditorStore.getState().scene.elements[a.id].transform.position.y;
    useEditorStore.getState().nudgeSelection(0, 10);
    const finalY = useEditorStore.getState().scene.elements[a.id].transform.position.y;
    expect(finalY - initialY).toBe(10);
  });

  it('nudge multi-element: one undo entry per call (atomic-undo gate, mirrors Phase 7 Pitfall 4)', () => {
    const a = createBoxElement({ name: 'A' });
    const b = createBoxElement({ name: 'B' });
    const c = createBoxElement({ name: 'C' });
    useEditorStore.getState().addElement(a);
    useEditorStore.getState().addElement(b);
    useEditorStore.getState().addElement(c);
    useEditorStore.getState().setSelectedIds([a.id, b.id, c.id]);
    // Clear history to isolate the nudge
    useEditorStore.temporal.getState().clear();
    const before = useEditorStore.temporal.getState().pastStates.length;
    useEditorStore.getState().nudgeSelection(1, 0);
    const after = useEditorStore.temporal.getState().pastStates.length;
    expect(after - before).toBe(1); // exactly ONE history entry, not 3
  });

  it('nudge with pixel art snap: post-nudge x/y are Math.round()ed', () => {
    const a = createBoxElement();
    useEditorStore.getState().addElement(a);
    useEditorStore.getState().setSelectedIds([a.id]);
    // Place at non-integer position
    useEditorStore.getState().updateElementTransform(a.id, {
      position: { x: 1.4, y: 2.6, z: 0 },
    });
    // Enable pixel-art mode (Phase 14 schema field — set via setState shim)
    useEditorStore.setState((state) => {
      (state.scene.settings as { pixelArtMode?: boolean }).pixelArtMode = true;
      return state;
    });
    useEditorStore.getState().nudgeSelection(1, -1);
    const pos = useEditorStore.getState().scene.elements[a.id].transform.position;
    // 1.4 + 1 = 2.4 → round → 2
    expect(pos.x).toBe(2);
    // 2.6 - 1 = 1.6 → round → 2
    expect(pos.y).toBe(2);
  });

  it('nudge without pixel art snap: positions stay fractional', () => {
    const a = createBoxElement();
    useEditorStore.getState().addElement(a);
    useEditorStore.getState().setSelectedIds([a.id]);
    useEditorStore.getState().updateElementTransform(a.id, {
      position: { x: 1.4, y: 2.6, z: 0 },
    });
    // No pixel-art mode set (default = undefined → false)
    useEditorStore.getState().nudgeSelection(0.5, 0);
    const pos = useEditorStore.getState().scene.elements[a.id].transform.position;
    // 1.4 + 0.5 = 1.9, no round
    expect(pos.x).toBeCloseTo(1.9);
  });
});
