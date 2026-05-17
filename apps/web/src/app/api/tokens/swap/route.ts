import { NextResponse } from 'next/server';
import BN from 'bn.js';
import { createClient } from '@/lib/supabase/server';
import {
  loadPoolByMint,
  quoteSwap,
  buildSwapTx,
  PoolNotFoundError,
  PoolMigratedError,
  type SwapDirection,
} from '@/lib/tokens/swap';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Body = {
  tokenMint?: string;
  direction?: string;
  amountIn?: string;
  slippageBps?: number;
};

const VALID_DIRECTIONS: readonly SwapDirection[] = ['buy', 'sell'];

/**
 * POST /api/tokens/swap
 *
 * Builds an unsigned swap2 (ExactIn) tx the wallet can sign. Auth-gated to
 * tie tx-builds to a known user (rate budget per-IP is cheap protection but
 * we want a real account on the hook for any abuse follow-up).
 *
 * Cost: zero credits. The bonding-curve pool collects its own fees on-chain;
 * Arcadery doesn't intermediate. We just construct the tx.
 */
export async function POST(request: Request) {
  const rl = checkRateLimit('tokens:swap', clientIp(request), 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many swap requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to swap', code: 'auth_required' }, { status: 401 });
  }

  const userWallet = user.user_metadata?.wallet_address as string | undefined;
  if (!userWallet) {
    return NextResponse.json({ error: 'No wallet linked to this account' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const tokenMint = body?.tokenMint?.trim();
  const direction = body?.direction?.trim() as SwapDirection | undefined;
  const amountStr = body?.amountIn?.trim();
  const slippageBps = Math.max(0, Math.min(5000, body?.slippageBps ?? 100));

  if (!tokenMint || !direction || !amountStr) {
    return NextResponse.json({ error: 'Missing tokenMint, direction, or amountIn' }, { status: 400 });
  }
  if (!VALID_DIRECTIONS.includes(direction)) {
    return NextResponse.json({ error: 'direction must be "buy" or "sell"' }, { status: 400 });
  }

  let amountIn: BN;
  try {
    amountIn = new BN(amountStr);
    if (amountIn.isNeg() || amountIn.isZero()) throw new Error();
  } catch {
    return NextResponse.json({ error: 'amountIn must be a positive integer string' }, { status: 400 });
  }

  try {
    const handles = await loadPoolByMint(tokenMint);
    const quote = await quoteSwap({ handles, direction, amountIn, slippageBps });
    const minimumAmountOut = new BN(quote.minimumAmountOut);

    const built = await buildSwapTx({
      handles,
      direction,
      amountIn,
      minimumAmountOut,
      ownerAddress: userWallet,
    });

    return NextResponse.json({
      serializedTx: built.serializedTx,
      blockhash: built.blockhash,
      lastValidBlockHeight: built.lastValidBlockHeight,
      expectedAmountOut: quote.amountOut,
      minimumAmountOut: quote.minimumAmountOut,
    });
  } catch (err) {
    if (err instanceof PoolNotFoundError) {
      return NextResponse.json({ error: 'Pool not found for this token', code: 'pool_not_found' }, { status: 404 });
    }
    if (err instanceof PoolMigratedError) {
      return NextResponse.json(
        { error: 'Pool has graduated to DAMM — trade on Meteora.', code: 'pool_migrated' },
        { status: 410 },
      );
    }
    console.error('buildSwapTx failed', err);
    const msg = err instanceof Error ? err.message : 'Swap build failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
