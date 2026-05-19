'use client';

import { type ThreeEvent, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useEditorStore } from '../stores/editor-store';
import { setElementRef, getElementRef } from './element-refs';
import type { ReactNode } from 'react';
import type { ElementTransform } from '@arcadery/shared';

/**
 * Universal Selection + Direct Manipulation.
 *
 * KEY ARCHITECTURAL FIX: the outer <Selectable> group owns the element's
 * transform (position/rotation/scale). Inner element renderers (box, sphere,
 * plane, sprite, model, text, light) render at LOCAL origin — they no longer
 * apply transform themselves. This makes:
 *   • TransformControls work — gizmo attaches at the element's world position
 *     (was previously stuck at (0,0,0) regardless of element location).
 *   • click-and-drag work — `getElementRef(id).position` returns the real
 *     position so drag math computes the correct delta (was previously
 *     reading (0,0,0) and snapping elements to wherever the cursor first hit
 *     instead of moving them by that delta).
 *
 * Drag features:
 *   - Click anywhere on an element + drag to translate. 4px threshold so a
 *     static click still selects without nudging.
 *   - Multi-select: dragging any member of the selection moves the whole set.
 *   - Snap: hold Cmd/Ctrl during the drag to snap each axis to SNAP_STEP.
 *   - 2D ortho: drag plane is XY — Z preserved.
 *   - 3D perspective: drag plane is the ground (XZ). Hold Shift to switch to
 *     a vertical drag plane facing the camera (lets you raise/lower Y).
 *   - Window-level pointermove/up listeners keep the gesture alive even when
 *     the cursor leaves the element bounds.
 *   - zundo pause/resume collapses the drag into ONE undo entry instead of
 *     one entry per pointermove frame.
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
  /** Set when the drag is locked to Y-axis (shift in 3D mode). */
  yLocked: boolean;
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
  // Transform OWNED here now — was previously applied on the inner mesh of
  // each element renderer, which left this outer group stuck at the origin
  // and broke click-drag + the TransformControls gizmo.
  const transform = useEditorStore(
    (s) => s.scene.elements[id]?.transform,
  ) as ElementTransform | undefined;
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
    // Shift+pointerdown is two-purpose: if released without moving past
    // DRAG_THRESHOLD_PX, it's a selection toggle (handled by handleClick).
    // If the user moves, the gesture promotes to a Y-axis drag (3D mode).
    e.stopPropagation();

    const obj = groupRef.current;
    if (!obj) return;

    // Resolve drag target set: dragging a member of a multi-select moves the
    // whole set; otherwise just this element (and we adopt the selection).
    const state = useEditorStore.getState();
    const selected = state.selectedIds;
    const isPartOfMulti = selected.length > 1 && selected.includes(id);
    const dragIds = isPartOfMulti ? selected : [id];

    // Pull startPos from the live store rather than ref.position so we are
    // immune to any out-of-sync drift between React's source-of-truth and
    // the three.js scene graph. (Defensive: the refactor should keep them in
    // sync, but startPos is the canonical drag origin and must not be wrong.)
    const tracked: TrackedElement[] = [];
    for (const eid of dragIds) {
      const el = state.scene.elements[eid];
      if (!el) continue;
      tracked.push({
        id: eid,
        startPos: { ...el.transform.position },
      });
    }
    if (tracked.length === 0) return;

    const yLocked = e.nativeEvent.shiftKey && state.viewMode === '3d';
    const viewMode = state.viewMode;
    let planeNormal: THREE.Vector3;
    if (viewMode === '3d') {
      if (yLocked) {
        // Vertical plane facing the camera. Normal is camera-forward
        // projected onto XZ, so the plane is parallel to the world Y axis.
        // Hits on this plane vary in Y — perfect for lifting elements.
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        if (camDir.lengthSq() < 1e-4) camDir.set(0, 0, -1);
        camDir.normalize();
        planeNormal = camDir;
      } else {
        // Ground plane. Y stays constant unless the user holds Shift.
        planeNormal = new THREE.Vector3(0, 1, 0);
      }
    } else {
      // 2D ortho: plane perpendicular to camera (effectively XY).
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
      yLocked,
    };

    // Pause undo history. One commit on release.
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
        // Activate the snap-guides flag so the viewport HUD can render a
        // grid overlay near the dragged element while Cmd/Ctrl is held.
        useEditorStore.getState().setDragActive({
          elementId: drag.primary,
          snapping: ev.metaKey || ev.ctrlKey,
        });
      }

      raycaster.setFromCamera(ndcFromEvent(ev, gl.domElement), camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(drag.plane, hit)) return;

      const snapping = ev.metaKey || ev.ctrlKey;
      // Keep the snap HUD flag in sync as the user toggles the modifier mid-drag.
      useEditorStore.getState().setDragActive({
        elementId: drag.primary,
        snapping,
      });

      const dx = hit.x - drag.startHit.x;
      const dy = hit.y - drag.startHit.y;
      const dz = hit.z - drag.startHit.z;

      const updateElementTransform =
        useEditorStore.getState().updateElementTransform;
      for (const t of drag.tracked) {
        let x = t.startPos.x;
        let y = t.startPos.y;
        let z = t.startPos.z;
        if (drag.yLocked) {
          // Only the Y delta from the camera-facing plane is meaningful here.
          y = t.startPos.y + dy;
        } else {
          x = t.startPos.x + dx;
          y = t.startPos.y + dy;
          z = t.startPos.z + dz;
        }
        if (snapping) {
          x = snap(x, SNAP_STEP);
          y = snap(y, SNAP_STEP);
          z = snap(z, SNAP_STEP);
        }
        updateElementTransform(t.id, { position: { x, y, z } });
      }
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
          const el = useEditorStore.getState().scene.elements[t.id];
          if (!el) continue;
          finals[t.id] = { ...el.transform.position };
        }

        const updateElementTransform =
          useEditorStore.getState().updateElementTransform;
        // Snap back to starts (still paused → not recorded).
        for (const t of drag.tracked) {
          updateElementTransform(t.id, { position: t.startPos });
        }
        // Resume, then apply finals — one zundo entry covers the whole drag.
        temporal.getState().resume();
        for (const t of drag.tracked) {
          const fin = finals[t.id];
          if (!fin) continue;
          updateElementTransform(t.id, { position: fin });
        }
      } else {
        temporal.getState().resume();
        // Pointerdown happened but never crossed threshold → no selection
        // change to record. Still need to enforce single-select if this was
        // a fresh click on an unselected element.
        if (!isPartOfMulti && !e.nativeEvent.shiftKey) {
          state.setSelectedIds([id]);
        }
      }

      useEditorStore.getState().setDragActive(null);

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

  // Fall through if the transform is missing (element was deleted mid-render).
  if (!transform) return null;

  return (
    <group
      ref={(obj: THREE.Group | null) => {
        groupRef.current = obj;
        setElementRef(id, obj);
      }}
      position={[transform.position.x, transform.position.y, transform.position.z]}
      rotation={[transform.rotation.x, transform.rotation.y, transform.rotation.z]}
      scale={[transform.scale.x, transform.scale.y, transform.scale.z]}
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
