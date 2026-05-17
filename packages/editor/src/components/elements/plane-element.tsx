/* eslint-disable react/no-unknown-property */
'use client';

import { Edges } from '@react-three/drei';
import { useEditorStore } from '../../stores/editor-store';

export function PlaneElement({
  id,
  isSelected,
  isHovered,
}: {
  id: string;
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  // Note: <Selectable> wrap is applied by scene-renderer.tsx via ELEMENT_REGISTRY routing — DO NOT import Selectable here.
  const element = useEditorStore((s) => s.scene.elements[id]);
  if (!element || element.type !== 'plane') return null;
  if (!element.visible) return null;
  const { transform, width, height, material } = element;
  const ringColor = isSelected ? '#4f9eff' : 'rgba(255, 255, 255, 0.6)';
  const showRing = isSelected || isHovered;
  return (
    <mesh
      position={[transform.position.x, transform.position.y, transform.position.z]}
      rotation={[
        transform.rotation.x - Math.PI / 2,
        transform.rotation.y,
        transform.rotation.z,
      ]}
      scale={[transform.scale.x, transform.scale.y, transform.scale.z]}
    >
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
