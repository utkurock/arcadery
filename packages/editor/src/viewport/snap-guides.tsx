/* eslint-disable react/no-unknown-property */
'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { useEditorStore } from '../stores/editor-store';

// Snap-guides overlay. Rendered INSIDE the Canvas as a sibling of the scene.
// Activates only when the user is actively dragging an element AND holding
// Cmd/Ctrl (snap modifier). Shows:
//   • a faint 0.5wu grid (matches SNAP_STEP in selection-manager.tsx)
//     centered on the dragged element so the user sees what the snap is
//     locking to
//   • two long axis guides (X and Z in 3D / X and Y in 2D) through the
//     element's current snapped position so cross-element alignment is
//     visually obvious
// The component returns null when no drag is active or no modifier is held —
// zero render cost otherwise.

const GRID_HALF_EXTENT = 6; // 12 wu × 12 wu grid centered on the element
const SNAP_STEP = 0.5;

export function SnapGuides() {
  const drag = useEditorStore((s) => s.dragActive);
  const viewMode = useEditorStore((s) => s.viewMode);
  const element = useEditorStore((s) =>
    drag ? s.scene.elements[drag.elementId] ?? null : null,
  );

  // Pre-build the grid line geometry once. The actual mesh just moves with
  // the dragged element via a `position` prop.
  const gridGeo = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const N = (GRID_HALF_EXTENT * 2) / SNAP_STEP;
    if (viewMode === '3d') {
      // Grid laid flat on Y=0 plane (camera-relative offset added below).
      for (let i = -N / 2; i <= N / 2; i++) {
        const v = i * SNAP_STEP;
        points.push(
          new THREE.Vector3(-GRID_HALF_EXTENT, 0, v),
          new THREE.Vector3(GRID_HALF_EXTENT, 0, v),
        );
        points.push(
          new THREE.Vector3(v, 0, -GRID_HALF_EXTENT),
          new THREE.Vector3(v, 0, GRID_HALF_EXTENT),
        );
      }
    } else {
      // 2D ortho: grid laid on the XY plane (Z held constant).
      for (let i = -N / 2; i <= N / 2; i++) {
        const v = i * SNAP_STEP;
        points.push(
          new THREE.Vector3(-GRID_HALF_EXTENT, v, 0),
          new THREE.Vector3(GRID_HALF_EXTENT, v, 0),
        );
        points.push(
          new THREE.Vector3(v, -GRID_HALF_EXTENT, 0),
          new THREE.Vector3(v, GRID_HALF_EXTENT, 0),
        );
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return geo;
  }, [viewMode]);

  if (!drag || !drag.snapping || !element) return null;
  const p = element.transform.position;
  const center: [number, number, number] =
    viewMode === '3d' ? [Math.round(p.x), p.y, Math.round(p.z)] : [Math.round(p.x), Math.round(p.y), p.z];

  return (
    <group position={center}>
      <lineSegments geometry={gridGeo}>
        <lineBasicMaterial
          color="#8b7ec8"
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </lineSegments>
      {/* Axis guides through the snapped element position. */}
      <AxisGuide viewMode={viewMode} />
    </group>
  );
}

function AxisGuide({ viewMode }: { viewMode: '2d' | '3d' }) {
  const long = 60;
  // Two crossing lines aligned to the snap grid. Brighter than the grid,
  // semi-transparent, no depth so they sit on top.
  if (viewMode === '3d') {
    return (
      <group>
        {/* X axis */}
        <Line from={[-long, 0, 0]} to={[long, 0, 0]} color="#ec4899" />
        {/* Z axis */}
        <Line from={[0, 0, -long]} to={[0, 0, long]} color="#22d3ee" />
      </group>
    );
  }
  return (
    <group>
      {/* X axis */}
      <Line from={[-long, 0, 0]} to={[long, 0, 0]} color="#ec4899" />
      {/* Y axis */}
      <Line from={[0, -long, 0]} to={[0, long, 0]} color="#22d3ee" />
    </group>
  );
}

function Line({
  from,
  to,
  color,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
}) {
  // Pre-built BufferGeometry — pass via the geometry prop (R3F's idiomatic
  // way to use a precomputed Three.js object). Spreading a BufferGeometry as
  // JSX props would no-op since it isn't a plain props bag.
  const geo = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...from),
      new THREE.Vector3(...to),
    ]);
  }, [from, to]);
  return (
    <line frustumCulled={false} geometry={geo}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={0.55}
        depthWrite={false}
        depthTest={false}
      />
    </line>
  );
}
