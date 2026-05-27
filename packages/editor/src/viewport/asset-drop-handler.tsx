 
'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore } from '../stores/editor-store';

// DOM-side drop coordinator. The `onDrop` handler in editor-viewport.tsx
// lives OUTSIDE the R3F Canvas (it has to — the Canvas swallows native HTML
// drag events) and so cannot raycast. It pushes the dropped asset + screen
// coords into `pendingAssetDrop`. This component lives INSIDE the Canvas
// (where `useThree` is available), drains the queue, raycasts the drop
// point to the drag plane (XY in 2D / XZ in 3D), creates the element with
// position = raycast hit, and clears the queue.

export function AssetDropHandler() {
  const { camera, gl } = useThree();
  const pending = useEditorStore((s) => s.pendingAssetDrop);

  useEffect(() => {
    if (!pending) return;
    const state = useEditorStore.getState();
    const viewMode = state.viewMode;

    // Convert screen coords → canvas-relative NDC.
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((pending.screen.x - rect.left) / rect.width) * 2 - 1,
      -((pending.screen.y - rect.top) / rect.height) * 2 + 1,
    );

    let world: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    let planeNormal: THREE.Vector3;
    if (viewMode === '3d') {
      planeNormal = new THREE.Vector3(0, 1, 0);
    } else {
      planeNormal = new THREE.Vector3();
      camera.getWorldDirection(planeNormal).negate();
    }
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      planeNormal,
      new THREE.Vector3(0, 0, 0),
    );
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, hit)) {
      world = { x: hit.x, y: hit.y, z: hit.z };
    }

    // Create the element at the raycast hit and select it.
    const { payload } = pending;
    let newId: string | null = null;
    if (payload.isModel) {
      newId = state.addModelFromAsset({
        id: payload.id,
        url: payload.url,
        name: payload.name ?? 'Model',
      });
    } else {
      newId = state.addSpriteFromAsset({
        id: payload.id,
        url: payload.url,
        name: payload.name ?? 'Sprite',
        aspectRatio: payload.aspectRatio ?? 1,
        ...(payload.frameUrls && payload.frameUrls.length >= 2
          ? { frameUrls: payload.frameUrls, frameRate: payload.frameRate ?? 8 }
          : {}),
      });
    }
    if (newId) {
      state.updateElementTransform(newId, { position: world });
    }
    state.setPendingAssetDrop(null);
  }, [pending, camera, gl]);

  return null;
}
