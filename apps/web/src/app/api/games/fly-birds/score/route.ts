import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  let body: { wallet?: string; score?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { wallet, score } = body;
  if (!wallet || typeof score !== 'number') {
    return Response.json({ error: 'Missing wallet or score' }, { status: 400 });
  }

  // Tighter than the leaderboard limiter (one submit per 5s per IP) — score
  // submissions happen automatically on game-end, so a player can't trigger
  // them faster than playing through a round.
  const rl = checkRateLimit('fly-birds:score', clientIp(req), 12, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: 'Too many score submissions' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const supabase = createAdminClient();
  const { data: id, error } = await supabase.rpc('fly_birds_submit_score', {
    p_wallet: wallet,
    p_score: Math.floor(score),
  });
  if (error) {
    console.error('[fly-birds/score] submit failed', error);
    return Response.json({ error: 'Failed to submit score' }, { status: 500 });
  }
  return Response.json({ ok: true, id });
}
