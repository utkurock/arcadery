import { z } from 'zod';
import { MaterialSchema } from '../primitives';
import { BaseElementSchema } from '../base-element';

export const SphereElementSchema = BaseElementSchema.extend({
  type: z.literal('sphere'),
  radius: z.number().min(0.1).max(10).default(0.5),
  material: MaterialSchema.default({}),
});

export type SphereElement = z.infer<typeof SphereElementSchema>;
