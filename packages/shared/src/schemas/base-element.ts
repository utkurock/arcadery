import { z } from 'zod';
import { TransformSchema } from './primitives';
import { BehaviorSchema } from './behaviors';

export const BaseElementSchema = z.object({
  id: z.string(),
  name: z.string(),
  transform: TransformSchema,
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  layerId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  /**
   * Game logic attached to this element. Read by the play-mode runtime
   * (PixiJS canvas / R3F scene). Empty by default — element is purely visual.
   */
  behaviors: z.array(BehaviorSchema).optional(),
});
