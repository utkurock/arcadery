import { GoogleGenAI } from '@google/genai';

/**
 * Gemini model constant.
 *
 * History note:
 *   gemini-2.5-flash returned consistent 500 INTERNAL on our scene schema
 *   (large discriminated union of every element type). Suspect a schema /
 *   model-version compatibility quirk specific to 2.5. Reverted to 2.0-flash
 *   which is battle-tested with large response schemas, similar pricing,
 *   acceptable quality for game scene generation.
 */
export const GEMINI_MODEL = 'gemini-2.5-flash';

let client: GoogleGenAI | null = null;

/**
 * Returns a singleton GoogleGenAI client.
 * Server-only -- never import from client components.
 */
export function getGeminiClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not set. Add it to apps/web/.env.local',
      );
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}
