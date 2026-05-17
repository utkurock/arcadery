'use client';

import { useEditorStore } from '../stores/editor-store';
import { Selectable } from './selection-manager';
import { useShallow } from 'zustand/react/shallow';
import { ELEMENT_REGISTRY } from '../registry';

export function SceneRenderer() {
  const elementIds = useEditorStore(useShallow((s) => Object.keys(s.scene.elements)));
  return (
    <>
      {elementIds.map((id) => (
        <SceneElementRenderer key={id} id={id} />
      ))}
    </>
  );
}

function SceneElementRenderer({ id }: { id: string }) {
  const elementType = useEditorStore((s) => s.scene.elements[id]?.type);
  if (!elementType) return null;
  const Component = ELEMENT_REGISTRY[elementType];
  if (!Component) return null;
  return (
    <Selectable id={id}>
      {(isSelected, isHovered) => (
        <Component id={id} isSelected={isSelected} isHovered={isHovered} />
      )}
    </Selectable>
  );
}
