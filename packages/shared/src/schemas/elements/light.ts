import { z } from 'zod';
import { BaseElementSchema } from '../base-element';

export const LightElementSchema = BaseElementSchema.extend({
  type: z.literal('light'),
  lightType: z.enum(['point', 'spot', 'directional']).default('point'),
  color: z.string().default('#ffffff'),
  intensity: z.number().min(0).max(10).default(1),
  castShadow: z.boolean().default(false),
});

export type LightElement = z.infer<typeof LightElementSchema>;
