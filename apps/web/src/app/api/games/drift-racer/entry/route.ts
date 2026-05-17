import { NextResponse } from 'next/server';
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

/**
 * POST /api/games/drift-racer/entry
 *
 * Body: { signature: string, wallet: string }
 *
 * Verifies the player paid the 0.01 SOL entry fee in the given transaction.
 * Returns 200 on success — that response is the client's permission to start
 * the race. We do NOT persist this anywhere; verification is re-done if the
 * page reloads, and the on-chain signature is cheap to re-check.
 */
export async function POST(request: Request) {
  const rl = checkRateLimit('drift:entry', clientIp(request), 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many entry-fee checks, slow down.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const treasury = publicTreasuryAddress();
  if (!treasury) {
    // No treasury configured = devnet bypass mode. Returning ok lets local
    // development run end-to-end without anyone holding the keys.
    return NextResponse.json({ ok: true, bypassed: true });
  }

  const body = (await request.json().catch(() => null)) as {
    signature?: string;
    wallet?: string;
  } | null;
  const signature = body?.signature?.trim();
  const wallet = body?.wallet?.trim();
  if (!signature || !wallet) {
    return NextResponse.json(
      { error: 'Missing signature or wallet' },
      { status: 400 },
    );
  }

  try {
    const verified = await verifyEntryTransfer({
      signature,
      expectedPayer: wallet,
      expectedLamports: DRIFT_ENTRY_FEE_LAMPORTS,
    });
    return NextResponse.json({ ok: true, ...verified });
  } catch (err) {
    if (err instanceof EntryVerificationError) {
      const status = err.code === 'not_found' ? 425 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error('drift entry verify failed', err);
    return NextResponse.json(
      { error: 'Could not verify entry fee' },
      { status: 500 },
    );
  }
}
