'use client';

import { useEditorStore } from '../stores/editor-store';
import { useShallow } from 'zustand/react/shallow';
import { ELEMENT_REGISTRY } from '../registry';

export function ReadOnlySceneRenderer() {
  const elementIds = useEditorStore(useShallow((s) => Object.keys(s.scene.elements)));
  return (
    <>
      {elementIds.map((id) => (
        <ReadOnlyElement key={id} id={id} />
      ))}
    </>
  );
}

function ReadOnlyElement({ id }: { id: string }) {
  const elementType = useEditorStore((s) => s.scene.elements[id]?.type);
  if (!elementType) return null;
  const Component = ELEMENT_REGISTRY[elementType];
  if (!Component) return null;
  return (
    <group>
      <Component id={id} isSelected={false} />
    </group>
  );
}
