import { NextRequest } from 'next/server';
import { getGeminiClient, GEMINI_MODEL } from '@/lib/ai/gemini';
import {
  modifyElementJsonSchema,
  generateSceneJsonSchema,
} from '@/lib/ai/schema-converter';
import {
  MODIFY_SYSTEM_PROMPT,
  GENERATE_SYSTEM_PROMPT,
  buildUserPrompt,
} from '@/lib/ai/prompts';
import type { AiGenerateRequest } from '@/lib/ai/types';
import { createClient } from '@/lib/supabase/server';
import { spendCredits, grantCredits, InsufficientCreditsError } from '@/lib/credits/server';
import { AI_GENERATE_COST, INSUFFICIENT_CREDITS_STATUS } from '@/lib/credits/config';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

const MAX_REF_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB — Gemini inline limit is 20MB; we cap lower for cost.

/**
 * Resolve a reference image (data URL or remote URL) into a Gemini inline-data
 * part. Returns null on any failure — the caller falls back to text-only so a
 * broken / oversized image never blocks the generation request.
 */
async function resolveRefImagePart(refImage: string): Promise<
  { inlineData: { mimeType: string; data: string } } | null
> {
  try {
    if (refImage.startsWith('data:')) {
      const match = refImage.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return null;
      const [, mimeType, data] = match;
      // base64 string length × 3/4 ≈ byte size.
      if (data.length * 0.75 > MAX_REF_IMAGE_BYTES) return null;
      return { inlineData: { mimeType, data } };
    }
    if (/^https?:\/\//i.test(refImage)) {
      const res = await fetch(refImage);
      if (!res.ok) return null;
      const contentLength = Number(res.headers.get('content-length') ?? 0);
      if (contentLength > MAX_REF_IMAGE_BYTES) return null;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_REF_IMAGE_BYTES) return null;
      const mimeType = res.headers.get('content-type') ?? 'image/png';
      const data = Buffer.from(buf).toString('base64');
      return { inlineData: { mimeType, data } };
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

// ---------------------------------------------------------------------------
// POST /api/ai/generate — non-streaming for reliability
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

  const systemPrompt = mode === 'modify' ? MODIFY_SYSTEM_PROMPT : GENERATE_SYSTEM_PROMPT;
  const jsonSchema = mode === 'modify' ? modifyElementJsonSchema : generateSceneJsonSchema;
  // We resolve the image part below, but the prompt builder needs to know
  // up-front whether one will be attached so it can add explicit "use this
  // image" instructions to the text part. Without that, Gemini sees the
  // image but treats it as decorative and ignores it entirely.
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
    const client = getGeminiClient();

    // Build contents with optional reference image. When the user attached
    // an image (via the Image button, drag-from-asset-gallery, or "Send to
    // chat"), pass it inline so Gemini can actually look at it instead of
    // just having a thumbnail floating in the UI. Failed image resolution
    // (404, too large, malformed data URL) downgrades to text-only.
    // refPart was resolved above so userPrompt could be built with the right
    // "use this image" instructions when an image is actually attached.
    const contents = refPart
      ? [{ role: 'user' as const, parts: [refPart, { text: userPrompt }] }]
      : userPrompt;

    // Two-tier attempt: prefer strict schema validation, fall back to JSON
    // mime type alone if Gemini reports INTERNAL (we hit this with 2.5-flash
    // on our large discriminated-union schema — Google's planner sometimes
    // returns 500 INTERNAL for big responseSchema payloads). The fallback
    // still asks for `application/json`, and our server-side JSON.parse
    // + sanitizer handles the rest.
    let response: Awaited<ReturnType<typeof client.models.generateContent>> | null = null;
    let lastErr: unknown = null;
    // Two attempts max — strict schema first, no-schema fallback if Gemini
    // chokes on our discriminated union. The previous 3-attempt schedule (2
    // schema retries + fallback) added ~14s of wait when 2.5-flash returned
    // INTERNAL twice in a row. Faster to skip straight to the fallback.
    const attempts: Array<{ withSchema: boolean; label: string }> = [
      { withSchema: true, label: 'schema' },
      { withSchema: false, label: 'no-schema fallback' },
    ];
    for (let i = 0; i < attempts.length; i++) {
      const { withSchema, label } = attempts[i];
      try {
        response = await client.models.generateContent({
          model: GEMINI_MODEL,
          contents,
          config: withSchema
            ? {
                responseMimeType: 'application/json',
                responseSchema: jsonSchema,
                systemInstruction: systemPrompt,
              }
            : {
                responseMimeType: 'application/json',
                systemInstruction: systemPrompt,
              },
        });
        if (i > 0) console.warn(`[ai/generate] succeeded on ${label}`);
        break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const retriable = /INTERNAL|UNAVAILABLE|503|502|504|deadline|timeout/i.test(msg);
        if (!retriable || i === attempts.length - 1) throw err;
        console.warn(`[ai/generate] retriable error (${label}):`, msg.slice(0, 200));
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    if (!response) throw lastErr ?? new Error('No response after retries');

    const rawText = response.text;
    if (!rawText) {
      await refund('empty_response');
      return Response.json({ error: 'Empty response from AI' }, { status: 500 });
    }

    // Parse and sanitize numbers
    let parsed: unknown;
    try {
      // Fix Gemini's infinite-zero bug: truncate long number sequences
      const cleaned = rawText.replace(/(\d+\.?\d{0,4})\d{10,}/g, '$1');
      parsed = JSON.parse(cleaned);
    } catch {
      await refund('invalid_json');
      return Response.json({ error: 'Invalid JSON in AI response' }, { status: 500 });
    }

    const sanitized = sanitizeNumbers(parsed);

    // Return as SSE for compatibility with existing client code
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
    console.error('[ai/generate] gemini call failed:', err);
    await refund('gemini_error');
    const raw = err instanceof Error ? err.message : 'Unknown error';
    // Friendly mapping for known Gemini error classes — gives the user
    // something actionable instead of the raw JSON error envelope.
    let message = raw;
    if (/INTERNAL|UNAVAILABLE|503|502|504/i.test(raw)) {
      message = "Gemini is having a moment — please try again in a few seconds.";
    } else if (/RESOURCE_EXHAUSTED|429|quota/i.test(raw)) {
      message = 'AI rate limit hit. Wait a minute and try again.';
    } else if (/PERMISSION_DENIED|401|API key/i.test(raw)) {
      message = 'AI service not authorized. The API key may be invalid or expired.';
    } else if (/SAFETY|blocked/i.test(raw)) {
      message = 'Prompt was blocked by content filters. Try rephrasing.';
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
