'use client';

import { TransformControls } from '@react-three/drei';
import { useCallback } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { getElementRef } from './element-refs';

/**
 * Phase 8 — multi-select aware. The gizmo only mounts when EXACTLY ONE element
 * is selected (per UI-SPEC line 113-115). Centroid-based group transforms are
 * out of scope for Phase 8.
 */
export function TransformControlsWrapper() {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const mode = useEditorStore((s) => s.mode);
  const transformMode = useEditorStore((s) => s.transformMode);
  const updateElementTransform = useEditorStore((s) => s.updateElementTransform);

  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;

  const handleChange = useCallback(() => {
    if (!selectedId) return;
    const obj = getElementRef(selectedId);
    if (!obj) return;
    updateElementTransform(selectedId, {
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
      scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
    });
  }, [selectedId, updateElementTransform]);

  // Multi-select hides the gizmo (UI-SPEC line 115).
  // `select` mode also hides it — that tool is for free click-drag selection
  // with no gizmo handles, axis-locked manipulation is opt-in via
  // Move/Rotate/Scale tools.
  if (!selectedId || mode !== 'edit' || transformMode === 'select') return null;

  const obj = getElementRef(selectedId);
  if (!obj) return null;

  return (
    <TransformControls
      object={obj}
      mode={transformMode}
      onObjectChange={handleChange}
    />
  );
}
