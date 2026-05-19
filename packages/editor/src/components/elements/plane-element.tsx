/* eslint-disable react/no-unknown-property */
'use client';

import { Edges } from '@react-three/drei';
import { useEditorStore } from '../../stores/editor-store';

// Transform applied by outer <Selectable>. The inner mesh keeps a LOCAL
// -PI/2 X rotation so the plane lies flat by convention — this is a geometric
// orientation, not a user-facing transform, and is composed on top of the
// element's transform.rotation already applied by Selectable.

export function PlaneElement({
  id,
  isSelected,
  isHovered,
}: {
  id: string;
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  const element = useEditorStore((s) => s.scene.elements[id]);
  if (!element || element.type !== 'plane') return null;
  if (!element.visible) return null;
  const { width, height, material } = element;
  const ringColor = isSelected ? '#4f9eff' : 'rgba(255, 255, 255, 0.6)';
  const showRing = isSelected || isHovered;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial
        color={material.color}
        opacity={material.opacity}
        transparent={material.opacity < 1}
        metalness={material.metalness ?? 0.1}
        roughness={material.roughness ?? 0.7}
      />
      {showRing && <Edges color={ringColor} threshold={15} />}
    </mesh>
  );
}
