'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../stores/editor-store';
import { computeMarqueeHits } from './marquee-math';
import { getElementRef } from './element-refs';

/**
 * Phase 8 SELECT-03 (B5 fix) — R3F-side marquee component.
 *
 * Mounts INSIDE <Canvas> so it can call useThree() for camera + canvas size.
 * Subscribes to the store's `marqueeRect` slice; whenever the rect changes,
 * recomputes hits via computeMarqueeHits and writes them to `marqueeHoverIds`.
 *
 * Returns null. Pure compute bridge. NO DOM output, NO React portal — the
 * earlier monolithic MarqueeOverlay portaled DOM out of Canvas (a known R3F
 * reconciler hazard); the B5 split eliminates that path.
 *
 * Sibling component MarqueeDom (mounted OUTSIDE Canvas) owns the pointer
 * handlers and writes the rect; this component reacts to those writes.
 */
export function MarqueeR3F() {
  const isEditMode = useEditorStore((s) => s.mode === 'edit');
  const elementIds = useEditorStore(useShallow((s) => Object.keys(s.scene.elements)));
  const marqueeRect = useEditorStore((s) => s.marqueeRect);
  const setMarqueeHoverIds = useEditorStore((s) => s.setMarqueeHoverIds);
  const clearMarqueeHoverIds = useEditorStore((s) => s.clearMarqueeHoverIds);

  const { camera, size } = useThree();

  useEffect(() => {
    if (!isEditMode || !marqueeRect) {
      // No active drag — nothing to recompute. (The DOM side also clears
      // marqueeHoverIds on pointerup; this branch is just the no-op path.)
      return;
    }
    const { x, y, w, h } = marqueeRect;
    const hits = computeMarqueeHits(
      { left: x, top: y, right: x + w, bottom: y + h },
      elementIds,
      camera,
      { width: size.width, height: size.height },
      getElementRef,
    );
    setMarqueeHoverIds(hits);
  }, [isEditMode, marqueeRect, elementIds, camera, size.width, size.height, setMarqueeHoverIds]);

  // Defensive cleanup if the component unmounts mid-drag.
  useEffect(() => {
    return () => {
      clearMarqueeHoverIds();
    };
  }, [clearMarqueeHoverIds]);

  return null;
}
