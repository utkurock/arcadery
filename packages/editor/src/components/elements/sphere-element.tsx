 
'use client';

import { Edges } from '@react-three/drei';
import { useEditorStore } from '../../stores/editor-store';

// Transform applied by outer <Selectable> — see box-element.tsx note.

export function SphereElement({
  id,
  isSelected,
  isHovered,
}: {
  id: string;
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  const element = useEditorStore((s) => s.scene.elements[id]);
  if (!element || element.type !== 'sphere') return null;
  if (!element.visible) return null;
  const { radius, material } = element;
  const ringColor = isSelected ? '#4f9eff' : 'rgba(255, 255, 255, 0.6)';
  const showRing = isSelected || isHovered;
  return (
    <mesh>
      <sphereGeometry args={[radius, 32, 32]} />
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
