import { NextRequest } from 'next/server';
import { deepseekJson } from '@/lib/ai/deepseek';
import { anthropicStructured, type AnthropicImage } from '@/lib/ai/anthropic';
import {
  GenerateSceneResponseSchema,
  generateSceneToolSchema,
  modifyElementToolSchema,
} from '@/lib/ai/schema-converter';
import {
  MODIFY_SYSTEM_PROMPT,
  GENERATE_SYSTEM_PROMPT,
  buildUserPrompt,
} from '@/lib/ai/prompts';
import type { AiGenerateRequest } from '@/lib/ai/types';
import { SceneElementSchema } from '@arcadery/shared/schemas';
import { createClient } from '@/lib/supabase/server';
import { spendCredits, grantCredits, InsufficientCreditsError } from '@/lib/credits/server';
import { AI_GENERATE_COST, INSUFFICIENT_CREDITS_STATUS } from '@/lib/credits/config';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

const MAX_REF_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB — keep ref images small for cost.

const ANTHROPIC_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

/**
 * Resolve a reference image (data URL or remote URL) into an Anthropic image
 * block. Returns null on any failure — the caller falls back to text-only so a
 * broken / oversized image never blocks the request. Only Claude (Sonnet) sees
 * images; DeepSeek is text-only, so any image-bearing request routes to Sonnet.
 */
async function resolveRefImagePart(refImage: string): Promise<AnthropicImage | null> {
  try {
    if (refImage.startsWith('data:')) {
      const match = refImage.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return null;
      const [, mimeType, data] = match;
      if (!ANTHROPIC_MEDIA_TYPES.has(mimeType)) return null;
      // base64 string length × 3/4 ≈ byte size.
      if (data.length * 0.75 > MAX_REF_IMAGE_BYTES) return null;
      return {
        kind: 'base64',
        mediaType: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data,
      };
    }
    if (/^https?:\/\//i.test(refImage)) {
      const res = await fetch(refImage);
      if (!res.ok) return null;
      const contentLength = Number(res.headers.get('content-length') ?? 0);
      if (contentLength > MAX_REF_IMAGE_BYTES) return null;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_REF_IMAGE_BYTES) return null;
      const mimeType = res.headers.get('content-type') ?? 'image/png';
      if (!ANTHROPIC_MEDIA_TYPES.has(mimeType)) return null;
      const data = Buffer.from(buf).toString('base64');
      return {
        kind: 'base64',
        mediaType: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Sanitize numbers in parsed JSON — clamp any absurdly large values.
 */
function sanitizeNumbers(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number') {
    if (!isFinite(obj)) return 0;
    if (Math.abs(obj) > 1000) return Math.sign(obj) * 1000;
    return Math.round(obj * 1000) / 1000; // max 3 decimal places
  }
  if (Array.isArray(obj)) return obj.map(sanitizeNumbers);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = sanitizeNumbers(v);
    }
    return result;
  }
  return obj;
}

/**
 * Generate a full scene with DeepSeek. DeepSeek guarantees valid JSON but not
 * schema conformance, so we parse → sanitize → Zod-validate, retrying once with
 * a stricter nudge if the shape is wrong. Returns the sanitized object on success.
 */
async function generateSceneWithDeepSeek(userPrompt: string): Promise<unknown> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const user =
      attempt === 0
        ? userPrompt
        : `${userPrompt}\n\nYour previous response did not match the required JSON shape. Return ONLY a valid JSON object with renderEngine, elements[], description (and gameState for playable 2D scenes). No prose, no markdown.`;
    const raw = await deepseekJson({ system: GENERATE_SYSTEM_PROMPT, user });
    if (!raw) {
      lastErr = new Error('Empty response from DeepSeek');
      continue;
    }
    // Defensive: strip pathological long number runs before parsing.
    const cleaned = raw.replace(/(\d+\.?\d{0,4})\d{10,}/g, '$1');
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      lastErr = e;
      continue;
    }
    const sanitized = sanitizeNumbers(parsed);
    const check = GenerateSceneResponseSchema.safeParse(sanitized);
    if (check.success) return sanitized;
    lastErr = check.error;
  }
  throw lastErr ?? new Error('DeepSeek failed to produce a valid scene');
}

// ---------------------------------------------------------------------------
// POST /api/ai/generate — non-streaming for reliability
//   • mode: 'modify'                         → Sonnet (tool use, single element)
//   • mode: 'generate' + reference image     → Sonnet (vision, full scene)
//   • mode: 'generate' (text only)           → DeepSeek (full scene)
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: AiGenerateRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  const { prompt, context, mode } = body;
  const refImage =
    typeof (body as { refImage?: unknown }).refImage === 'string'
      ? ((body as { refImage: string }).refImage)
      : undefined;
  if (!prompt || !mode) {
    return Response.json({ error: 'Missing required fields: prompt, mode' }, { status: 400 });
  }

  const rl = checkRateLimit('ai:generate', clientIp(req), 30, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json(
      { error: 'Sign in to generate', code: 'auth_required' },
      { status: 401 },
    );
  }

  let balanceAfter: number;
  try {
    balanceAfter = await spendCredits({
      userId: user.id,
      amount: AI_GENERATE_COST,
      reason: 'ai_generate',
      metadata: { mode },
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return Response.json(
        {
          error: 'Not enough credits. Top up to continue.',
          code: 'insufficient_credits',
          cost: AI_GENERATE_COST,
        },
        { status: INSUFFICIENT_CREDITS_STATUS },
      );
    }
    console.error('spend failed', err);
    return Response.json({ error: 'Credit system error' }, { status: 500 });
  }

  // Resolve the image up-front so buildUserPrompt can add explicit "use this
  // image" instructions when one is actually attached.
  const refPart = refImage ? await resolveRefImagePart(refImage) : null;
  const userPrompt = buildUserPrompt(prompt, context, mode, !!refPart);

  async function refund(reason: string) {
    try {
      await grantCredits({
        userId: user!.id,
        amount: AI_GENERATE_COST,
        reason: 'refund',
        metadata: { operation: 'ai_generate', cause: reason },
      });
    } catch (refundErr) {
      console.error('refund failed', refundErr);
    }
  }

  try {
    let sanitized: unknown;

    if (mode === 'modify') {
      // Visual / styling edit of a single selected element → Sonnet tool use.
      const toolInput = (await anthropicStructured({
        system: MODIFY_SYSTEM_PROMPT,
        userText: userPrompt,
        image: refPart,
        tool: {
          name: 'return_element',
          description:
            'Return the complete modified scene element as JSON, keeping the same id and type.',
          input_schema: modifyElementToolSchema,
        },
      })) as { element?: unknown };
      const element = sanitizeNumbers(toolInput?.element);
      const check = SceneElementSchema.safeParse(element);
      if (!check.success) {
        await refund('invalid_element');
        return Response.json({ error: 'AI returned an invalid element' }, { status: 500 });
      }
      sanitized = element;
    } else if (refPart) {
      // Generation guided by a reference image → Sonnet (vision-capable).
      const toolInput = await anthropicStructured({
        system: GENERATE_SYSTEM_PROMPT,
        userText: userPrompt,
        image: refPart,
        tool: {
          name: 'return_scene',
          description:
            'Return the generated game scene as JSON: renderEngine, elements[], description, and gameState when playable.',
          input_schema: generateSceneToolSchema,
        },
      });
      const candidate = sanitizeNumbers(toolInput);
      const check = GenerateSceneResponseSchema.safeParse(candidate);
      if (!check.success) {
        await refund('invalid_scene');
        return Response.json({ error: 'AI returned an invalid scene' }, { status: 500 });
      }
      sanitized = candidate;
    } else {
      // Plain text-prompt generation → DeepSeek (with validate + retry).
      sanitized = await generateSceneWithDeepSeek(userPrompt);
    }

    // Return as SSE for compatibility with existing client code.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const doneEvent = {
          type: 'done',
          json: JSON.stringify(sanitized),
          balance: balanceAfter,
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Credits-Balance': String(balanceAfter),
      },
    });
  } catch (err) {
    console.error('[ai/generate] generation failed:', err);
    await refund('ai_error');
    const status = (err as { status?: number })?.status;
    const raw = err instanceof Error ? err.message : 'Unknown error';
    // Friendly mapping for the common failure classes across DeepSeek + Claude.
    let message = raw;
    if (status === 429 || /rate.?limit|RESOURCE_EXHAUSTED|quota/i.test(raw)) {
      message = 'AI rate limit hit. Wait a minute and try again.';
    } else if (status === 401 || status === 403 || /API key|authentication|permission/i.test(raw)) {
      message = 'AI service not authorized. The API key may be invalid or expired.';
    } else if (status === 529 || (status !== undefined && status >= 500) || /overloaded|unavailable|timeout|deadline/i.test(raw)) {
      message = 'The AI is having a moment — please try again in a few seconds.';
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
