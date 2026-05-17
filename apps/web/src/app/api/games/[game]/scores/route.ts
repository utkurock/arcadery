import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicTreasuryAddress, BUILTIN_ENTRY_FEE_LAMPORTS } from '@/lib/builtin-games/config';
import { EntryVerificationError, verifyBuiltinEntryTransfer } from '@/lib/builtin-games/server';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type FieldKind = 'int' | 'num';
type Field = { key: string; col: string; kind: FieldKind; min: number; max: number };

type GameConfig = {
  table: string;
  selectCols: string;
  orderCol: string;
  fields: Field[];
  hasWon?: boolean;
  plausibility?: (vals: Record<string, number>) => { code: string; message: string } | null;
};

const GAMES: Record<string, GameConfig> = {
  'brick-smash': {
    table: 'brick_smash_scores',
    selectCols:
      'id, wallet_address, display_name, score, level_reached, bricks_destroyed, duration_sec, won, created_at',
    orderCol: 'score',
    fields: [
      { key: 'score', col: 'score', kind: 'int', min: 0, max: 100_000_000 },
      { key: 'levelReached', col: 'level_reached', kind: 'int', min: 1, max: 99 },
      { key: 'bricksDestroyed', col: 'bricks_destroyed', kind: 'int', min: 0, max: 100_000 },
      { key: 'durationSec', col: 'duration_sec', kind: 'num', min: 0, max: 36000 },
    ],
    hasWon: true,
  },
  'cube-runner': {
    table: 'cube_runner_scores',
    selectCols: 'id, wallet_address, display_name, distance_m, coins, duration_sec, created_at',
    orderCol: 'distance_m',
    fields: [
      { key: 'distanceM', col: 'distance_m', kind: 'int', min: 0, max: 1_000_000 },
      { key: 'coins', col: 'coins', kind: 'int', min: 0, max: 1_000_000 },
      { key: 'durationSec', col: 'duration_sec', kind: 'num', min: 0, max: 36000 },
    ],
    plausibility: (v) =>
      v.distance_m > v.duration_sec * 30
        ? { code: 'too_fast', message: 'Distance vs duration is implausible' }
        : null,
  },
  'neon-asteroids': {
    table: 'neon_asteroids_scores',
    selectCols: 'id, wallet_address, display_name, score, wave_reached, duration_sec, created_at',
    orderCol: 'score',
    fields: [
      { key: 'score', col: 'score', kind: 'int', min: 0, max: 100_000_000 },
      { key: 'waveReached', col: 'wave_reached', kind: 'int', min: 1, max: 9999 },
      { key: 'durationSec', col: 'duration_sec', kind: 'num', min: 0, max: 36000 },
    ],
    plausibility: (v) =>
      v.duration_sec < 2 && v.score > 0
        ? { code: 'too_fast', message: 'Run too short for a score' }
        : null,
  },
};

type Ctx = { params: Promise<{ game: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { game } = await ctx.params;
  const cfg = GAMES[game];
  if (!cfg) return NextResponse.json({ error: 'Unknown game' }, { status: 404 });

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const wallet = url.searchParams.get('wallet')?.trim() || null;
  const admin = createAdminClient();
  let q = admin
    .from(cfg.table)
    .select(cfg.selectCols)
    .order(cfg.orderCol, { ascending: false })
    .limit(limit);
  if (wallet) q = q.eq('wallet_address', wallet);
  const { data, error } = await q;
  if (error) {
    console.error('leaderboard read failed', error);
    return NextResponse.json({ error: 'Failed to read leaderboard' }, { status: 500 });
  }
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(request: Request, ctx: Ctx) {
  const { game } = await ctx.params;
  const cfg = GAMES[game];
  if (!cfg) return NextResponse.json({ error: 'Unknown game' }, { status: 404 });

  const rl = checkRateLimit(`${game}:scores`, clientIp(request), 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many submissions, slow down.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const wallet = typeof body?.wallet === 'string' ? body.wallet : null;
  if (!body || !wallet) {
    return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
  }

  const values: Record<string, number> = {};
  for (const f of cfg.fields) {
    const raw = body[f.key];
    const v = f.kind === 'int' ? clampInt(raw, f.min, f.max) : clampNum(raw, f.min, f.max);
    if (v == null) {
      return NextResponse.json({ error: 'Invalid score fields' }, { status: 400 });
    }
    values[f.col] = v;
  }

  if (cfg.plausibility) {
    const bad = cfg.plausibility(values);
    if (bad) {
      return NextResponse.json({ error: bad.message, code: bad.code }, { status: 400 });
    }
  }

  const displayName =
    typeof body.displayName === 'string' ? body.displayName.slice(0, 32).trim() : null;
  const entrySignature =
    typeof body.entrySignature === 'string' ? body.entrySignature.trim() : '';

  const treasury = publicTreasuryAddress();
  if (treasury) {
    if (!entrySignature) {
      return NextResponse.json(
        { error: 'Entry signature required', code: 'entry_required' },
        { status: 402 },
      );
    }
    try {
      await verifyBuiltinEntryTransfer({
        signature: entrySignature,
        expectedPayer: wallet,
        expectedLamports: BUILTIN_ENTRY_FEE_LAMPORTS,
      });
    } catch (err) {
      if (err instanceof EntryVerificationError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
      }
      throw err;
    }
  }

  const insert: Record<string, unknown> = {
    wallet_address: wallet,
    display_name: displayName,
    ...values,
    entry_signature: entrySignature || null,
  };
  if (cfg.hasWon) insert.won = !!body.won;

  const admin = createAdminClient();
  const { data, error } = await admin.from(cfg.table).insert(insert).select('id').single();
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
