import { z } from 'zod';
import { Vec3Schema, MaterialSchema } from '../primitives';
import { BaseElementSchema } from '../base-element';

export const BoxElementSchema = BaseElementSchema.extend({
  type: z.literal('box'),
  size: z.object({
    x: z.number().min(0.1).max(50).default(1),
    y: z.number().min(0.1).max(50).default(1),
    z: z.number().min(0.1).max(50).default(1),
  }).default({ x: 1, y: 1, z: 1 }),
  material: MaterialSchema.default({}),
});

export type BoxElement = z.infer<typeof BoxElementSchema>;
