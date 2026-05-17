import { NextResponse } from 'next/server';
import { publicTreasuryAddress, BUILTIN_ENTRY_FEE_LAMPORTS } from '@/lib/builtin-games/config';
import { EntryVerificationError, verifyBuiltinEntryTransfer } from '@/lib/builtin-games/server';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const ALLOWED = new Set(['brick-smash', 'cube-runner', 'neon-asteroids']);

type Ctx = { params: Promise<{ game: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { game } = await ctx.params;
  if (!ALLOWED.has(game)) {
    return NextResponse.json({ error: 'Unknown game' }, { status: 404 });
  }

  const rl = checkRateLimit(`${game}:entry`, clientIp(request), 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many entry-fee checks, slow down.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const treasury = publicTreasuryAddress();
  if (!treasury) {
    return NextResponse.json({ ok: true, bypassed: true });
  }

  const body = (await request.json().catch(() => null)) as {
    signature?: string;
    wallet?: string;
  } | null;
  const signature = body?.signature?.trim();
  const wallet = body?.wallet?.trim();
  if (!signature || !wallet) {
    return NextResponse.json({ error: 'Missing signature or wallet' }, { status: 400 });
  }

  try {
    const verified = await verifyBuiltinEntryTransfer({
      signature,
      expectedPayer: wallet,
      expectedLamports: BUILTIN_ENTRY_FEE_LAMPORTS,
    });
    return NextResponse.json({ ok: true, ...verified });
  } catch (err) {
    if (err instanceof EntryVerificationError) {
      const status = err.code === 'not_found' ? 425 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error(`${game} entry verify failed`, err);
    return NextResponse.json({ error: 'Could not verify entry fee' }, { status: 500 });
  }
}
