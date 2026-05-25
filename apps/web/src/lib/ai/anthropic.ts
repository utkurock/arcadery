import Anthropic from '@anthropic-ai/sdk';

/**
 * Anthropic / Claude model constant.
 *
 * Sonnet handles the "visual / styling" layer of generated games: the
 * `modify` flow (element right-click → "AI ile değiştir") and any generation
 * that comes with a reference image (Sonnet is vision-capable; DeepSeek is
 * text-only). We use forced tool use to get schema-shaped JSON back — the
 * tool's `input_schema` plays the role Gemini's `responseSchema` used to.
 */
export const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

const MAX_TOKENS = 8000;

let client: Anthropic | null = null;

/**
 * Returns a singleton Anthropic client.
 * Server-only -- never import from client components.
 */
export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. Add it to apps/web/.env.local',
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

type AnthropicMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export type AnthropicImage =
  | { kind: 'base64'; mediaType: AnthropicMediaType; data: string }
  | { kind: 'url'; url: string };

export interface StructuredTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Force Claude to call a single tool whose input matches `tool.input_schema`,
 * and return the parsed tool input. This is the structured-output mechanism:
 * `tool_choice: { type: 'tool' }` guarantees the model responds by populating
 * the schema rather than free text.
 *
 * The large static `system` prompt is sent as a cacheable block so repeated
 * requests hit the prompt cache instead of re-billing the full prefix.
 */
export async function anthropicStructured(opts: {
  system: string;
  userText: string;
  image?: AnthropicImage | null;
  tool: StructuredTool;
}): Promise<unknown> {
  const c = getAnthropicClient();

  const content: Anthropic.ContentBlockParam[] = [];
  if (opts.image) {
    content.push({
      type: 'image',
      source:
        opts.image.kind === 'base64'
          ? {
              type: 'base64',
              media_type: opts.image.mediaType,
              data: opts.image.data,
            }
          : { type: 'url', url: opts.image.url },
    });
  }
  content.push({ type: 'text', text: opts.userText });

  const res = await c.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: opts.system,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      {
        name: opts.tool.name,
        description: opts.tool.description,
        input_schema: opts.tool.input_schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: opts.tool.name },
    messages: [{ role: 'user', content }],
  });

  const toolUse = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  return toolUse.input;
}
