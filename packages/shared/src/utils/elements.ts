import type { BoxElement } from '../schemas/elements/box';
import type { SphereElement } from '../schemas/elements/sphere';
import type { PlaneElement } from '../schemas/elements/plane';
import type { SpriteElement } from '../schemas/elements/sprite';
import type { TextElement } from '../schemas/elements/text';
import type { LightElement } from '../schemas/elements/light';
import type { ModelElement } from '../schemas/elements/model';
import { generateId } from './id';

const defaultTransform = () => ({
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

const defaultBase = (name: string) => ({
  id: generateId(),
  name,
  transform: defaultTransform(),
  visible: true,
  locked: false,
  tags: [] as string[],
});

export function createBoxElement(overrides?: Partial<BoxElement>): BoxElement {
  return {
    ...defaultBase('Box'),
    type: 'box' as const,
    size: { x: 1, y: 1, z: 1 },
    material: {
      color: '#ffffff',
      opacity: 1,
    },
    ...overrides,
  };
}

export function createSphereElement(overrides?: Partial<SphereElement>): SphereElement {
  return {
    ...defaultBase('Sphere'),
    type: 'sphere' as const,
    radius: 0.5,
    material: {
      color: '#ffffff',
      opacity: 1,
    },
    ...overrides,
  };
}

export function createPlaneElement(overrides?: Partial<PlaneElement>): PlaneElement {
  return {
    ...defaultBase('Plane'),
    type: 'plane' as const,
    width: 10,
    height: 10,
    material: {
      color: '#ffffff',
      opacity: 1,
    },
    ...overrides,
  };
}

export function createSpriteElement(overrides?: Partial<SpriteElement>): SpriteElement {
  return {
    ...defaultBase('Sprite'),
    type: 'sprite' as const,
    width: 1,
    height: 1,
    ...overrides,
  };
}

export function createTextElement(overrides?: Partial<TextElement>): TextElement {
  return {
    ...defaultBase('Text'),
    type: 'text' as const,
    content: 'Text',
    fontSize: 1,
    color: '#ffffff',
    ...overrides,
  };
}

export function createLightElement(overrides?: Partial<LightElement>): LightElement {
  return {
    ...defaultBase('Light'),
    type: 'light' as const,
    lightType: 'point',
    color: '#ffffff',
    intensity: 1,
    castShadow: false,
    ...overrides,
  };
}

export function createModelElement(overrides?: Partial<ModelElement>): ModelElement {
  return {
    ...defaultBase('Model'),
    type: 'model' as const,
    src: overrides?.src ?? '',
    uniformScale: 1,
    animationLoop: true,
    ...overrides,
  };
}
