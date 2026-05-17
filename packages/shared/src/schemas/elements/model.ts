import { z } from 'zod';
import { BaseElementSchema } from '../base-element';

/**
 * 3D model element. Backed by a GLB/GLTF file in storage. Animations come from
 * the GLB's own clips (skeletal animations) — referenced by name.
 */
export const ModelElementSchema = BaseElementSchema.extend({
  type: z.literal('model'),

  // GLB/GLTF URL
  src: z.string(),

  // Reference back to the asset row that produced this model.
  assetId: z.string().uuid().optional(),

  // Display scale on top of the GLB's intrinsic size.
  uniformScale: z.number().min(0.01).max(100).default(1),

  // Animation clip name to play (must match a clip in the GLB).
  // If undefined, the model stays in its rest pose.
  activeAnimation: z.string().optional(),

  // Animation behavior
  animationSpeed: z.number().min(0.1).max(4).optional(),
  animationLoop: z.boolean().optional(),

  // Optional tint applied to materials (multiplied with the base color)
  tint: z.string().optional(),

  // Cast/receive shadows
  castShadow: z.boolean().optional(),
  receiveShadow: z.boolean().optional(),
});

export type ModelElement = z.infer<typeof ModelElementSchema>;
