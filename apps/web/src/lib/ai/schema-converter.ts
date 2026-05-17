import { zodToJsonSchema } from 'zod-to-json-schema';
import { SceneElementSchema, GameStateConfigSchema } from '@arcadery/shared/schemas';
import { z } from 'zod';

/**
 * Recursively clean JSON schema for Gemini compatibility:
 * - Remove $schema
 * - Convert "const" to "enum" (Gemini doesn't support "const")
 * - Remove unsupported keywords like "additionalProperties"
 */
function cleanForGemini(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(cleanForGemini);
  if (typeof obj !== 'object') return obj;

  const record = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    // Skip $schema
    if (key === '$schema') continue;
    // Skip additionalProperties (Gemini doesn't support it)
    if (key === 'additionalProperties') continue;

    // Convert "const" to "enum"
    if (key === 'const') {
      result['enum'] = [value];
      continue;
    }

    result[key] = cleanForGemini(value);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Modify mode: AI returns a single SceneElement
// ---------------------------------------------------------------------------
export const modifyElementJsonSchema = cleanForGemini(
  zodToJsonSchema(SceneElementSchema, { $refStrategy: 'none' }),
) as Record<string, unknown>;

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
});

export const generateSceneJsonSchema = cleanForGemini(
  zodToJsonSchema(GenerateSceneResponseSchema, {
    $refStrategy: 'none',
  }),
) as Record<string, unknown>;
