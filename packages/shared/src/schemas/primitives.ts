import { z } from 'zod';

// Positions in 2D scenes are stored in display pixels (not game units), so we
// allow a wide range. 3D scenes use a smaller subset (typically ±50 units).
export const Vec3Schema = z.object({
  x: z.number().min(-5000).max(5000).default(0),
  y: z.number().min(-5000).max(5000).default(0),
  z: z.number().min(-5000).max(5000).default(0),
});

export const TransformSchema = z.object({
  position: Vec3Schema.default({}),
  rotation: z.object({
    x: z.number().min(-6.3).max(6.3).default(0),
    y: z.number().min(-6.3).max(6.3).default(0),
    z: z.number().min(-6.3).max(6.3).default(0),
  }).default({}),
  scale: z.object({
    x: z.number().min(0.01).max(100).default(1),
    y: z.number().min(0.01).max(100).default(1),
    z: z.number().min(0.01).max(100).default(1),
  }).default({ x: 1, y: 1, z: 1 }),
});

export const MaterialSchema = z.object({
  color: z.string().default('#ffffff'),
  opacity: z.number().min(0).max(1).default(1),
  metalness: z.number().min(0).max(1).optional(),
  roughness: z.number().min(0).max(1).optional(),
  textureUrl: z.string().optional(),
});

export type Vec3 = z.infer<typeof Vec3Schema>;
export type Transform = z.infer<typeof TransformSchema>;
export type Material = z.infer<typeof MaterialSchema>;
