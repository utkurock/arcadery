import type * as THREE from 'three';

const refs = new Map<string, THREE.Object3D>();

export function setElementRef(id: string, obj: THREE.Object3D | null) {
  if (obj) refs.set(id, obj);
  else refs.delete(id);
}

export function getElementRef(id: string): THREE.Object3D | undefined {
  return refs.get(id);
}
