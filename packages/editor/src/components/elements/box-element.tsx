/* eslint-disable react/no-unknown-property */
'use client';

import { Edges } from '@react-three/drei';
import { useEditorStore } from '../../stores/editor-store';

// NOTE: transform.position/rotation/scale are applied by the outer <Selectable>
// group (see selection-manager.tsx). This component renders at LOCAL origin so
// the gizmo + drag math both operate on a single authoritative source.

export function BoxElement({
  id,
  isSelected,
  isHovered,
}: {
  id: string;
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  const element = useEditorStore((s) => s.scene.elements[id]);
  if (!element || element.type !== 'box') return null;
  if (!element.visible) return null;
  const { size, material } = element;
  const ringColor = isSelected ? '#4f9eff' : 'rgba(255, 255, 255, 0.6)';
  const showRing = isSelected || isHovered;
  return (
    <mesh>
      <boxGeometry args={[size.x, size.y, size.z]} />
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
