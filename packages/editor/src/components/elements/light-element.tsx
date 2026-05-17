/* eslint-disable react/no-unknown-property */
'use client';

import { useEditorStore } from '../../stores/editor-store';

export function LightElement({
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
  if (!element || element.type !== 'light') return null;
  if (!element.visible) return null;
  const { transform, lightType, color, intensity, castShadow } = element;
  const pos: [number, number, number] = [
    transform.position.x,
    transform.position.y,
    transform.position.z,
  ];

  const ringColor = isSelected ? '#4f9eff' : 'rgba(255, 255, 255, 0.6)';
  const showRing = isSelected || isHovered;

  // Always-visible yellow helper sphere (existing precedent — radius 0.15 wu).
  const helper = (
    <mesh position={pos}>
      <sphereGeometry args={[0.15, 8, 8]} />
      <meshBasicMaterial color="#ffdd00" wireframe />
    </mesh>
  );

  // Selection / hover ring — slightly larger than the helper (radius 0.3 wu).
  const selectionIndicator = showRing ? (
    <mesh position={pos}>
      <sphereGeometry args={[0.3, 8, 8]} />
      <meshBasicMaterial color={ringColor} wireframe />
    </mesh>
  ) : null;

  // Phase 8 (SELECT-01): invisible raycast proxy. The visible helper + ring
  // are too small to click reliably when zoomed out; this generous 0.4 wu
  // sphere gives the raycaster a forgiving click target. Renders nothing
  // (visible={false}) but still raycasts (Assumption A1, Wave 0 confirmed).
  const raycastProxy = (
    <mesh position={pos} visible={false}>
      <sphereGeometry args={[0.4, 8, 8]} />
    </mesh>
  );

  return (
    <>
      {lightType === 'point' && (
        <pointLight position={pos} color={color} intensity={intensity} castShadow={castShadow} />
      )}
      {lightType === 'spot' && (
        <spotLight position={pos} color={color} intensity={intensity} castShadow={castShadow} />
      )}
      {lightType === 'directional' && (
        <directionalLight position={pos} color={color} intensity={intensity} castShadow={castShadow} />
      )}
      {helper}
      {selectionIndicator}
      {raycastProxy}
    </>
  );
}
