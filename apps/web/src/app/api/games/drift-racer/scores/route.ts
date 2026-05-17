import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  DRIFT_ENTRY_FEE_LAMPORTS,
  publicTreasuryAddress,
} from '@/lib/drift-racer/config';
import {
  EntryVerificationError,
  verifyEntryTransfer,
} from '@/lib/drift-racer/server';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type SubmitBody = {
  wallet?: string;
  displayName?: string | null;
  bestLapSec: number;
  totalTimeSec: number;
  driftScore: number;
  lapsCompleted: number;
  won: boolean;
  entrySignature?: string;
};

/**
 * GET /api/games/drift-racer/scores?limit=10
 *   Public read of the top of the board. Sorted by best_lap_sec ascending
 *   among winning runs.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 10));
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('drift_racer_scores')
    .select(
      'id, wallet_address, display_name, best_lap_sec, total_time_sec, drift_score, won, created_at',
    )
    .eq('won', true)
    .order('best_lap_sec', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('leaderboard read failed', error);
    return NextResponse.json({ error: 'Failed to read leaderboard' }, { status: 500 });
  }
  return NextResponse.json({ entries: data ?? [] });
}

/**
 * POST /api/games/drift-racer/scores
 *   Body: see SubmitBody.
 *   Re-verifies the entry-fee signature server-side so a tampered client can't
 *   submit a phantom run. Inserts a row and returns the row id.
 */
export async function POST(request: Request) {
  const rl = checkRateLimit('drift:scores', clientIp(request), 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many submissions, slow down.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => null)) as SubmitBody | null;
  if (!body || !body.wallet) {
    return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
  }

  // Sanity-cap the numeric fields so a tampered client can't insert junk.
  const bestLap = clampNum(body.bestLapSec, 5, 3600);
  const total = clampNum(body.totalTimeSec, 5, 36000);
  const drift = clampInt(body.driftScore, 0, 1_000_000_000);
  const laps = clampInt(body.lapsCompleted, 0, 99);
  if (bestLap == null || total == null || drift == null || laps == null) {
    return NextResponse.json({ error: 'Invalid score fields' }, { status: 400 });
  }
  const displayName =
    typeof body.displayName === 'string' ? body.displayName.slice(0, 32).trim() : null;

  // Re-verify entry fee unless treasury is unconfigured (dev-bypass mode).
  const treasury = publicTreasuryAddress();
  if (treasury) {
    const sig = body.entrySignature?.trim();
    if (!sig) {
      return NextResponse.json(
        { error: 'Entry signature required', code: 'entry_required' },
        { status: 402 },
      );
    }
    try {
      await verifyEntryTransfer({
        signature: sig,
        expectedPayer: body.wallet,
        expectedLamports: DRIFT_ENTRY_FEE_LAMPORTS,
      });
    } catch (err) {
      if (err instanceof EntryVerificationError) {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: 400 },
        );
      }
      throw err;
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('drift_racer_scores')
    .insert({
      wallet_address: body.wallet,
      display_name: displayName,
      best_lap_sec: bestLap,
      total_time_sec: total,
      drift_score: drift,
      laps_completed: laps,
      won: !!body.won,
      entry_signature: body.entrySignature ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('score insert failed', error);
    return NextResponse.json({ error: 'Failed to record score' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

function clampNum(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v < min || v > max) return null;
  return Math.round(v * 1000) / 1000;
}
function clampInt(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.floor(v);
  if (n < min || n > max) return null;
  return n;
}
