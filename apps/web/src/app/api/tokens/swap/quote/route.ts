import { NextResponse } from 'next/server';
import BN from 'bn.js';
import {
  loadPoolByMint,
  quoteSwap,
  PoolNotFoundError,
  PoolMigratedError,
  type SwapDirection,
} from '@/lib/tokens/swap';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type Body = {
  tokenMint?: string;
  direction?: string;
  /** Decimal string in base units (lamports / token base units). */
  amountIn?: string;
  /** Defaults to 100 (= 1%). Capped to 5000 (50%). */
  slippageBps?: number;
};

const VALID_DIRECTIONS: readonly SwapDirection[] = ['buy', 'sell'];

/**
 * POST /api/tokens/swap/quote
 *
 * Cheap "you'll receive ~X" preview for the swap modal — no auth, no tx
 * build. Hits the DBC SDK's swapQuote2(ExactIn). Caller debounces typing.
 */
export async function POST(request: Request) {
  const rl = checkRateLimit('tokens:swap:quote', clientIp(request), 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many quote requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
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
    return NextResponse.json({
      amountOut: quote.amountOut,
      minimumAmountOut: quote.minimumAmountOut,
      curveProgress: handles.curveProgress,
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
    console.error('quoteSwap failed', err);
    const msg = err instanceof Error ? err.message : 'Quote failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
