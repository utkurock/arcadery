/* eslint-disable react/no-unknown-property */
'use client';

import { Suspense } from 'react';
import { ModelObject } from '@arcadery/engine';
import { useEditorStore } from '../../stores/editor-store';

function ModelInner({
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
  if (!element || element.type !== 'model') return null;
  if (!element.visible) return null;
  if (!element.src) return null;

  const {
    transform,
    src,
    uniformScale,
    activeAnimation,
    animationSpeed,
    animationLoop,
    castShadow,
    receiveShadow,
  } = element;

  const s = uniformScale ?? 1;
  const finalScale: [number, number, number] = [
    transform.scale.x * s,
    transform.scale.y * s,
    transform.scale.z * s,
  ];

  const ringColor = isSelected ? '#4f9eff' : 'rgba(255, 255, 255, 0.6)';
  const showRing = isSelected || isHovered;

  return (
    <group>
      <ModelObject
        src={src}
        position={[transform.position.x, transform.position.y, transform.position.z]}
        rotation={[transform.rotation.x, transform.rotation.y, transform.rotation.z]}
        scale={finalScale}
        castShadow={castShadow ?? true}
        receiveShadow={receiveShadow ?? true}
        animation={activeAnimation}
        animationSpeed={animationSpeed ?? 1}
        animationLoop={animationLoop ?? true}
      />
      {showRing && (
        <mesh
          position={[transform.position.x, transform.position.y, transform.position.z]}
          rotation={[transform.rotation.x, transform.rotation.y, transform.rotation.z]}
          scale={finalScale}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={ringColor} wireframe />
        </mesh>
      )}
    </group>
  );
}

export function ModelElement({
  id,
  isSelected,
  isHovered,
}: {
  id: string;
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <ModelInner id={id} isSelected={isSelected} isHovered={isHovered} />
    </Suspense>
  );
}
