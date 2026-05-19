/* eslint-disable react/no-unknown-property */
'use client';

import { useEditorStore } from '../../stores/editor-store';

// Transform applied by outer <Selectable>. Light source + helper + raycast
// proxy all render at local origin so they inherit the group transform
// uniformly.

export function LightElement({
  id,
  isSelected,
  isHovered,
}: {
  id: string;
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  const element = useEditorStore((s) => s.scene.elements[id]);
  if (!element || element.type !== 'light') return null;
  if (!element.visible) return null;
  const { lightType, color, intensity, castShadow } = element;

  const ringColor = isSelected ? '#4f9eff' : 'rgba(255, 255, 255, 0.6)';
  const showRing = isSelected || isHovered;

  return (
    <>
      {lightType === 'point' && (
        <pointLight color={color} intensity={intensity} castShadow={castShadow} />
      )}
      {lightType === 'spot' && (
        <spotLight color={color} intensity={intensity} castShadow={castShadow} />
      )}
      {lightType === 'directional' && (
        <directionalLight color={color} intensity={intensity} castShadow={castShadow} />
      )}
      {/* Always-visible yellow helper sphere (radius 0.15 wu). */}
      <mesh>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshBasicMaterial color="#ffdd00" wireframe />
      </mesh>
      {/* Selection / hover ring. */}
      {showRing && (
        <mesh>
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshBasicMaterial color={ringColor} wireframe />
        </mesh>
      )}
      {/* Invisible raycast proxy (Phase 8). */}
      <mesh visible={false}>
        <sphereGeometry args={[0.4, 8, 8]} />
      </mesh>
    </>
  );
}
