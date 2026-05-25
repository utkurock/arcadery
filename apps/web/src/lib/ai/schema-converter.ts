import { zodToJsonSchema } from 'zod-to-json-schema';
import { SceneElementSchema, GameStateConfigSchema, IntroConfigSchema } from '@arcadery/shared/schemas';
import { z } from 'zod';

/**
 * Recursively strip the `$schema` meta key. zodToJsonSchema emits it at the
 * top level; Anthropic tool `input_schema` doesn't want it. Everything else
 * (anyOf for discriminated unions, numeric bounds, etc.) is left intact —
 * non-strict tool use treats them as guidance and the route Zod-validates the
 * returned input anyway.
 */
function stripSchemaKey(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(stripSchemaKey);
  if (typeof obj !== 'object') return obj;

  const record = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === '$schema') continue;
    result[key] = stripSchemaKey(value);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Generate mode: AI returns an array of elements + description
// ---------------------------------------------------------------------------
export const GenerateSceneResponseSchema = z.object({
  renderEngine: z.enum(['phaser', 'three']).describe('phaser for 2D games, three for 3D games'),
  elements: z.array(SceneElementSchema),
  description: z
    .string()
    .describe('1-2 sentence description of the generated scene'),
  gameState: GameStateConfigSchema.optional().describe(
    'When set, the scene becomes a playable game: initial score/health, win condition, camera follow target',
  ),
  intro: IntroConfigSchema.optional().describe(
    'Themed entry/splash screen shown before play: theme, title, subtitle, ctaLabel',
  ),
});

/**
 * Tool schema for the generate flow (Sonnet, when a reference image is
 * attached). The response object is already a plain object, so it maps
 * directly onto an Anthropic tool `input_schema`.
 */
export const generateSceneToolSchema = stripSchemaKey(
  zodToJsonSchema(GenerateSceneResponseSchema, { $refStrategy: 'none' }),
) as Record<string, unknown>;

/**
 * Tool schema for the modify flow (Sonnet). `SceneElementSchema` is a
 * discriminated union → `anyOf` at the top level, which can't be a tool
 * `input_schema` root (must be an object). We wrap it under `element` and the
 * route reads `toolInput.element`.
 */
export const modifyElementToolSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    element: stripSchemaKey(
      zodToJsonSchema(SceneElementSchema, { $refStrategy: 'none' }),
    ),
  },
  required: ['element'],
  additionalProperties: false,
};
