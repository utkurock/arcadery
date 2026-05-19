/* eslint-disable react/no-unknown-property */
'use client';

import { Suspense } from 'react';
import { ModelObject } from '@arcadery/engine';
import { useEditorStore } from '../../stores/editor-store';

// Transform applied by outer <Selectable>. ModelObject renders at local
// origin; the uniformScale knob still composes in here as a model-local
// multiplier so the user-visible scale handle keeps its semantics.

function ModelInner({
  id,
  isSelected,
  isHovered,
}: {
  id: string;
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  const element = useEditorStore((s) => s.scene.elements[id]);
  if (!element || element.type !== 'model') return null;
  if (!element.visible) return null;
  if (!element.src) return null;

  const {
    src,
    uniformScale,
    activeAnimation,
    animationSpeed,
    animationLoop,
    castShadow,
    receiveShadow,
  } = element;

  const s = uniformScale ?? 1;
  const localScale: [number, number, number] = [s, s, s];

  const ringColor = isSelected ? '#4f9eff' : 'rgba(255, 255, 255, 0.6)';
  const showRing = isSelected || isHovered;

  return (
    <group>
      <ModelObject
        src={src}
        scale={localScale}
        castShadow={castShadow ?? true}
        receiveShadow={receiveShadow ?? true}
        animation={activeAnimation}
        animationSpeed={animationSpeed ?? 1}
        animationLoop={animationLoop ?? true}
      />
      {showRing && (
        <mesh scale={localScale}>
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
