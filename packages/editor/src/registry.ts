import type { ElementType } from '@arcadery/shared';
import type { ComponentType } from 'react';
import { BoxElement } from './components/elements/box-element';
import { SphereElement } from './components/elements/sphere-element';
import { PlaneElement } from './components/elements/plane-element';
import { SpriteElement } from './components/elements/sprite-element';
import { ModelElement } from './components/elements/model-element';
import { TextElement } from './components/elements/text-element';
import { LightElement } from './components/elements/light-element';

const Noop = () => null;

// Phase 8 (SELECT-02): isHovered added — every element receives hover state
// from the <Selectable> wrapper render-prop and decides whether to render a
// hover ring (white@60%) versus a selection ring (#4f9eff). Hover-while-selected
// is suppressed by the wrapper itself (so isHovered=false when isSelected=true).
export const ELEMENT_REGISTRY: Record<
  ElementType,
  ComponentType<{ id: string; isSelected?: boolean; isHovered?: boolean }>
> = {
  box: BoxElement,
  sphere: SphereElement,
  plane: PlaneElement,
  sprite: SpriteElement,
  model: ModelElement,
  text: TextElement,
  light: LightElement,
  // Tilemap renderer is wired separately via the paint flow; placeholder for the union.
  tilemap: Noop,
};
