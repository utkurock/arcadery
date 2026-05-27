 
'use client';

import { useEditorStore } from '../stores/editor-store';
import { useShallow } from 'zustand/react/shallow';
import { ELEMENT_REGISTRY } from '../registry';

// Read-only mirror of <SceneRenderer> for preview / pre-play states. Element
// renderers no longer apply their own transform (the editor's <Selectable>
// owns it), so the wrapper group here has to apply the element's transform
// directly. Without this, every preview element would stack at the origin.

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
  const element = useEditorStore((s) => s.scene.elements[id]);
  if (!element) return null;
  const Component = ELEMENT_REGISTRY[element.type];
  if (!Component) return null;
  const t = element.transform;
  return (
    <group
      position={[t.position.x, t.position.y, t.position.z]}
      rotation={[t.rotation.x, t.rotation.y, t.rotation.z]}
      scale={[t.scale.x, t.scale.y, t.scale.z]}
    >
      <Component id={id} isSelected={false} />
    </group>
  );
}
