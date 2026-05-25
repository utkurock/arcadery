import OpenAI from 'openai';

/**
 * DeepSeek model constant.
 *
 * `deepseek-chat` (V3) is the general-purpose code/reasoning model. We use it
 * for the heavy structural work: full game-scene generation and the homepage
 * plan endpoint. DeepSeek exposes an OpenAI-compatible API, so we drive it
 * with the `openai` SDK pointed at DeepSeek's base URL.
 *
 * Important: DeepSeek only supports `response_format: { type: 'json_object' }`
 * (valid-JSON guarantee), NOT strict JSON-schema enforcement the way Gemini's
 * `responseSchema` did. Schema conformance is therefore enforced server-side:
 * the prompt describes the exact shape, and the route Zod-validates the parsed
 * result and retries on a mismatch. The word "json" must appear in the prompt
 * or DeepSeek rejects the json_object request.
 */
export const DEEPSEEK_MODEL = 'deepseek-chat';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

let client: OpenAI | null = null;

/**
 * Returns a singleton OpenAI client configured for DeepSeek.
 * Server-only -- never import from client components.
 */
export function getDeepSeekClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error(
        'DEEPSEEK_API_KEY is not set. Add it to apps/web/.env.local',
      );
    }
    client = new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL });
  }
  return client;
}

/**
 * Run a single non-streaming completion in JSON mode and return the raw text
 * (a JSON string). Callers parse + Zod-validate the result.
 */
export async function deepseekJson(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const c = getDeepSeekClient();
  const res = await c.chat.completions.create({
    model: DEEPSEEK_MODEL,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    response_format: { type: 'json_object' },
    max_tokens: opts.maxTokens ?? 8000,
  });
  return res.choices[0]?.message?.content ?? '';
}
