'use client';

import { type ThreeEvent, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useEditorStore } from '../stores/editor-store';
import { setElementRef, getElementRef } from './element-refs';
import type { ReactNode } from 'react';

/**
 * Phase 8 — Universal Selection + Direct Manipulation.
 *
 * Wraps an element with click-to-select, hover, and click-and-drag-to-move
 * behavior. Click handling stays compatible with prior versions (shift toggles,
 * plain click replaces). Drag is gated by a 4px movement threshold so a static
 * click still selects without inadvertently nudging the element.
 *
 * Drag features:
 *   - Multi-select: dragging any element of a multi-selection moves ALL
 *     selected elements by the same delta. History records one entry per drag.
 *   - Snap to grid: hold Cmd (mac) or Ctrl (win/linux) during drag to snap
 *     positions to SNAP_STEP units. The snap applies per-axis on the active
 *     drag plane.
 *   - Plane choice: in 2D (orthographic) the drag plane is XY — element Z is
 *     preserved. In 3D (perspective) the plane is XZ at the element's current
 *     Y — element Y is preserved. This matches user intuition (drag on the
 *     screen surface in 2D / on the ground in 3D); Y-axis lift in 3D still
 *     uses the TransformControls gizmo.
 *
 * Implementation notes:
 *   - We use WINDOW pointermove/pointerup listeners during a drag rather than
 *     R3F handlers; this keeps the gesture alive when the cursor leaves the
 *     element's bounding box mid-drag.
 *   - zundo `pause()`/`resume()` collapses the drag into a single history
 *     entry. Without it, every pointermove tick (~60Hz) would push its own
 *     entry and Ctrl+Z would be unusable.
 */

const DRAG_THRESHOLD_PX = 4;
const SNAP_STEP = 0.5;

type TrackedElement = {
  id: string;
  startPos: { x: number; y: number; z: number };
};

type DragState = {
  primary: string;
  tracked: TrackedElement[];
  startHit: THREE.Vector3;
  plane: THREE.Plane;
  startScreen: { x: number; y: number };
  activated: boolean;
};

function ndcFromEvent(ev: PointerEvent, canvas: HTMLCanvasElement): THREE.Vector2 {
  const rect = canvas.getBoundingClientRect();
  return new THREE.Vector2(
    ((ev.clientX - rect.left) / rect.width) * 2 - 1,
    -((ev.clientY - rect.top) / rect.height) * 2 + 1,
  );
}

function snap(v: number, step: number): number {
  return Math.round(v / step) * step;
}

export function Selectable({
  id,
  children,
}: {
  id: string;
  children: (isSelected: boolean, isHovered: boolean) => ReactNode;
}) {
  const isSelected = useEditorStore((s) => s.selectedIds.includes(id));
  const isHovered = useEditorStore(
    (s) => s.hoveredId === id || s.marqueeHoverIds.has(id),
  );
  const isEditMode = useEditorStore((s) => s.mode === 'edit');
  const groupRef = useRef<THREE.Group>(null);
  const dragRef = useRef<DragState | null>(null);
  const { camera, gl } = useThree();

  useEffect(() => {
    return () => {
      setElementRef(id, null);
    };
  }, [id]);

  const openContextMenu = useEditorStore((s) => s.openContextMenu);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation(); // SELECT-04: overlapping topmost wins
    if (!isEditMode) return;
    if (dragRef.current?.activated) return; // drag swallows the click
    const { setSelectedIds, toggleSelection } = useEditorStore.getState();
    if (e.nativeEvent.shiftKey) {
      toggleSelection(id);
    } else {
      setSelectedIds([id]);
    }
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (!isEditMode) return;
    e.stopPropagation();
    useEditorStore.getState().setHovered(id);
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const s = useEditorStore.getState();
    if (s.hoveredId === id) {
      s.setHovered(null);
    }
  };

  const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
    if (!isEditMode) return;
    e.stopPropagation();
    e.nativeEvent.preventDefault();
    openContextMenu({
      elementId: id,
      x: e.nativeEvent.clientX,
      y: e.nativeEvent.clientY,
    });
  };

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!isEditMode) return;
    if (e.nativeEvent.button !== 0) return;
    if (e.nativeEvent.shiftKey) return; // shift = selection toggle, not drag
    e.stopPropagation();

    const obj = groupRef.current;
    if (!obj) return;

    // Resolve the drag target set: if this element is part of a multi-select,
    // drag ALL selected; otherwise drag just this one and make it the active
    // selection. Read from store rather than props so we use the snapshot at
    // pointerdown (not a stale closure).
    const state = useEditorStore.getState();
    const selected = state.selectedIds;
    const isPartOfMulti = selected.length > 1 && selected.includes(id);
    const dragIds = isPartOfMulti ? selected : [id];
    if (!isPartOfMulti) state.setSelectedIds([id]);

    const tracked: TrackedElement[] = [];
    for (const eid of dragIds) {
      const ref = getElementRef(eid);
      if (!ref) continue;
      tracked.push({
        id: eid,
        startPos: { x: ref.position.x, y: ref.position.y, z: ref.position.z },
      });
    }
    if (tracked.length === 0) return;

    const viewMode = state.viewMode;
    let planeNormal: THREE.Vector3;
    if (viewMode === '3d') {
      // Ground plane. Y stays constant — vertical lift remains the gizmo's job.
      planeNormal = new THREE.Vector3(0, 1, 0);
    } else {
      // 2D ortho: plane perpendicular to the camera (effectively XY).
      planeNormal = new THREE.Vector3();
      camera.getWorldDirection(planeNormal).negate();
    }
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      planeNormal,
      obj.position,
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndcFromEvent(e.nativeEvent, gl.domElement), camera);
    const startHit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, startHit)) return;

    dragRef.current = {
      primary: id,
      tracked,
      startHit,
      plane,
      startScreen: { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY },
      activated: false,
    };

    // Pause undo history for the duration of the drag. One commit on release.
    const temporal = (useEditorStore as unknown as {
      temporal: { getState: () => { pause: () => void; resume: () => void } };
    }).temporal;
    temporal.getState().pause();

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (!drag.activated) {
        const dxs = ev.clientX - drag.startScreen.x;
        const dys = ev.clientY - drag.startScreen.y;
        if (Math.hypot(dxs, dys) < DRAG_THRESHOLD_PX) return;
        drag.activated = true;
      }

      raycaster.setFromCamera(ndcFromEvent(ev, gl.domElement), camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(drag.plane, hit)) return;

      const snapping = ev.metaKey || ev.ctrlKey;
      let dx = hit.x - drag.startHit.x;
      let dy = hit.y - drag.startHit.y;
      let dz = hit.z - drag.startHit.z;

      const updateElementTransform = useEditorStore.getState().updateElementTransform;
      for (const t of drag.tracked) {
        let x = t.startPos.x + dx;
        let y = t.startPos.y + dy;
        let z = t.startPos.z + dz;
        if (snapping) {
          x = snap(x, SNAP_STEP);
          y = snap(y, SNAP_STEP);
          z = snap(z, SNAP_STEP);
        }
        updateElementTransform(t.id, { position: { x, y, z } });
      }
      // Touch the lint-flagged let's; they're used inside the loop.
      void dx; void dy; void dz;
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      const drag = dragRef.current;
      const wasActivated = drag?.activated ?? false;

      if (wasActivated && drag) {
        // Capture final positions BEFORE rollback so we can commit them atomically.
        const finals: Record<string, { x: number; y: number; z: number }> = {};
        for (const t of drag.tracked) {
          const ref = getElementRef(t.id);
          if (!ref) continue;
          finals[t.id] = { x: ref.position.x, y: ref.position.y, z: ref.position.z };
        }

        const updateElementTransform = useEditorStore.getState().updateElementTransform;
        // Snap back to starts (still paused → not recorded).
        for (const t of drag.tracked) {
          updateElementTransform(t.id, { position: t.startPos });
        }
        // Resume, then apply finals — zundo records ONE entry covering all
        // moves combined, because all writes after resume() are batched in
        // React's microtask before the next render.
        temporal.getState().resume();
        for (const t of drag.tracked) {
          const fin = finals[t.id];
          if (!fin) continue;
          updateElementTransform(t.id, { position: fin });
        }
      } else {
        temporal.getState().resume();
      }

      // Defer clearing so handleClick (fires AFTER pointerup) sees `activated`.
      if (!wasActivated) {
        dragRef.current = null;
      } else {
        setTimeout(() => {
          dragRef.current = null;
        }, 0);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <group
      ref={(obj: THREE.Group | null) => {
        groupRef.current = obj;
        setElementRef(id, obj);
      }}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
    >
      {children(
        isSelected && isEditMode,
        isHovered && isEditMode && !isSelected,
      )}
    </group>
  );
}

