'use client';

import { useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../stores/editor-store';

interface InternalDragState {
  startX: number;
  startY: number;
  active: boolean; // true once movement crosses 6px threshold
}

const DRAG_THRESHOLD_PX = 6; // UI-SPEC line 226 — matches Phase 9 DRAG-03 contract

/**
 * Phase 8 SELECT-03 (B5 fix) — DOM-side marquee component.
 *
 * Mounts OUTSIDE the R3F <Canvas> as a sibling div in the viewport container.
 * Owns pointerdown / pointermove / pointerup. Writes the marquee rect to the
 * store; sibling MarqueeR3F (inside Canvas) reads the rect, computes hits via
 * the R3F camera hook, and writes marqueeHoverIds. Renders the brand-purple
 * rectangle from the store rect.
 *
 * Pointer capture (Pitfall 4 — Mac trackpad): pointerdown calls
 * setPointerCapture; pointerup releases via try/catch.
 *
 * Empty-scene guard: pointerdown is a no-op when 0 elements exist.
 *
 * Drag-below-threshold (<6px) on pointerup is the empty-canvas-deselect path
 * that replaces the retired y=-100 invisible plane (UI-SPEC line 247).
 * Selectable's e.stopPropagation() means clicks on actual elements never
 * reach this handler — the only path here is a TRUE empty-canvas click.
 */
export function MarqueeDom() {
  const isEditMode = useEditorStore((s) => s.mode === 'edit');
  const elementIds = useEditorStore(useShallow((s) => Object.keys(s.scene.elements)));
  const marqueeRect = useEditorStore((s) => s.marqueeRect);
  const setMarqueeRect = useEditorStore((s) => s.setMarqueeRect);
  const setSelectedIds = useEditorStore((s) => s.setSelectedIds);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const clearMarqueeHoverIds = useEditorStore((s) => s.clearMarqueeHoverIds);

  const stateRef = useRef<InternalDragState | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isEditMode) return;
      // Empty-scene guard
      if (elementIds.length === 0) return;
      const target = e.currentTarget;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        /* setPointerCapture may throw on synthetic events in tests; ignore */
      }
      const bounds = target.getBoundingClientRect();
      const startX = e.clientX - bounds.left;
      const startY = e.clientY - bounds.top;
      stateRef.current = { startX, startY, active: false };
    },
    [isEditMode, elementIds.length],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = stateRef.current;
      if (!state) return;
      const target = e.currentTarget;
      const bounds = target.getBoundingClientRect();
      const x = e.clientX - bounds.left;
      const y = e.clientY - bounds.top;
      const dx = x - state.startX;
      const dy = y - state.startY;
      const dist = Math.hypot(dx, dy);
      if (!state.active && dist < DRAG_THRESHOLD_PX) return;
      state.active = true;

      const left = Math.min(state.startX, x);
      const top = Math.min(state.startY, y);
      const right = Math.max(state.startX, x);
      const bottom = Math.max(state.startY, y);
      setMarqueeRect({ x: left, y: top, w: right - left, h: bottom - top });
    },
    [setMarqueeRect],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = stateRef.current;
      if (!state) return;
      const target = e.currentTarget;
      try {
        target.releasePointerCapture(e.pointerId);
      } catch {
        /* releasing a capture that's already gone is fine */
      }

      if (state.active) {
        // MarqueeR3F has been writing marqueeHoverIds reactively as the rect
        // changed. Read the latest hits and commit to selectedIds in one call.
        const hits = useEditorStore.getState().marqueeHoverIds;
        setSelectedIds(Array.from(hits));
      } else {
        // Drag <6px → empty-canvas-click deselect path (replaces the retired
        // y=-100 plane). Selectable's e.stopPropagation() means clicks on
        // elements never reach this handler; the only path here is a TRUE
        // empty-canvas click.
        clearSelection();
      }

      stateRef.current = null;
      setMarqueeRect(null);
      clearMarqueeHoverIds();
    },
    [setSelectedIds, clearSelection, setMarqueeRect, clearMarqueeHoverIds],
  );

  return (
    <div
      className="absolute inset-0 z-10"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {marqueeRect && (
        <div
          className="pointer-events-none absolute z-20 border border-[#8b7ec8] bg-[#8b7ec8]/10"
          style={{
            left: marqueeRect.x,
            top: marqueeRect.y,
            width: marqueeRect.w,
            height: marqueeRect.h,
          }}
        />
      )}
    </div>
  );
}
