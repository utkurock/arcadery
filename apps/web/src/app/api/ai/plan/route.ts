import { NextRequest } from 'next/server';
import { deepseekJson } from '@/lib/ai/deepseek';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

const PLAN_SYSTEM_PROMPT = `You are a game design planner. The user describes a game idea; analyze it and return a structured plan as JSON.

Return a JSON object with:
- "description": A 2-3 sentence summary of the game concept, mechanics, and visual style.
- "elements": An array of 8-12 planned game components, each an object with:
  - "type": one of "box", "sphere", "plane", "text", "light"
  - "name": descriptive name (e.g. "Player Character", "Ground Platform", "Score Display")
  - "role": brief description of what this element does in the game

Think about: player, ground, platforms, obstacles, UI text, lighting. Return ONLY valid JSON — no prose, no markdown.`;

export async function POST(req: NextRequest) {
  // Public endpoint (called from the landing page before sign-in). Cap aggressively
  // so a bored attacker can't burn the project's AI budget.
  const rl = checkRateLimit('ai:plan', clientIp(req), 10, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  let body: { prompt: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { prompt } = body;
  if (!prompt) {
    return Response.json({ error: 'Missing prompt' }, { status: 400 });
  }
  if (typeof prompt !== 'string' || prompt.length > 1200) {
    return Response.json({ error: 'Prompt too long (max 1200 chars)' }, { status: 400 });
  }

  try {
    const text = await deepseekJson({
      system: PLAN_SYSTEM_PROMPT,
      user: `User's game idea: "${prompt}"`,
      maxTokens: 2000,
    });
    if (!text) {
      return Response.json({ error: 'Empty response from AI' }, { status: 500 });
    }
    const parsed = JSON.parse(text);
    return Response.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
