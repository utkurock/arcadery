import { z } from 'zod';
import { BaseElementSchema } from '../base-element';

export const TextElementSchema = BaseElementSchema.extend({
  type: z.literal('text'),
  content: z.string().default('Text'),
  fontSize: z.number().min(0.1).max(10).default(1),
  color: z.string().default('#ffffff'),
  font: z.string().optional(),
});

export type TextElement = z.infer<typeof TextElementSchema>;
