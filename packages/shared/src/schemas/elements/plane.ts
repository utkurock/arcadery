import { z } from 'zod';
import { MaterialSchema } from '../primitives';
import { BaseElementSchema } from '../base-element';

export const PlaneElementSchema = BaseElementSchema.extend({
  type: z.literal('plane'),
  width: z.number().min(0.1).max(100).default(10),
  height: z.number().min(0.1).max(100).default(10),
  material: MaterialSchema.default({}),
});

export type PlaneElement = z.infer<typeof PlaneElementSchema>;
