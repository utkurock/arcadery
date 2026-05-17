import { PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import {
  SwapMode,
  type Swap2Params,
  type SwapQuote2Result,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import { getDbcClient } from './dbc';

export type SwapDirection = 'buy' | 'sell';

export class PoolNotFoundError extends Error {
  constructor() {
    super('pool_not_found');
    this.name = 'PoolNotFoundError';
  }
}

export class PoolMigratedError extends Error {
  constructor() {
    super('pool_migrated');
    this.name = 'PoolMigratedError';
  }
}

interface PoolHandles {
  poolAddress: PublicKey;
  configAddress: PublicKey;
  /** SDK-typed pool state. `any` to avoid leaking SDK types up the call stack. */
  pool: any;
  /** SDK-typed pool config. */
  config: any;
  /** Migration progress 0..1. */
  curveProgress: number;
}

/**
 * Resolve a tokenized game's DBC pool by its base mint, fetch state + config,
 * and check the pool isn't already graduated to DAMM. Throws typed errors so
 * the route handler can map them to clean status codes.
 */
export async function loadPoolByMint(baseMint: string): Promise<PoolHandles> {
  const { client, connection } = getDbcClient();
  let mintPk: PublicKey;
  try {
    mintPk = new PublicKey(baseMint);
  } catch {
    throw new PoolNotFoundError();
  }

  const found = await client.state.getPoolByBaseMint(mintPk);
  if (!found) throw new PoolNotFoundError();

  const pool: any = found.account;
  if (pool.isMigrated) throw new PoolMigratedError();

  const configAddress: PublicKey = pool.config;
  const config = await client.state.getPoolConfig(configAddress);

  // Best-effort progress (0..1). If it fails for any reason we just report 0;
  // it's only used for UI signaling, never for trade math.
  let curveProgress = 0;
  try {
    curveProgress = await client.state.getPoolQuoteTokenCurveProgress(found.publicKey);
  } catch {
    /* ignore */
  }

  return {
    poolAddress: found.publicKey,
    configAddress,
    pool,
    config,
    curveProgress,
  };
}

interface QuoteArgs {
  handles: PoolHandles;
  direction: SwapDirection;
  /** Amount-in in base units (lamports for SOL, 10^decimals for token). */
  amountIn: BN;
  slippageBps: number;
}

interface QuoteResult {
  amountOut: string;        // base units, decimal string
  minimumAmountOut: string; // base units, decimal string (after slippage)
}

/**
 * Run swapQuote2 in ExactIn mode. Buy = quote→base (swapBaseForQuote=false),
 * Sell = base→quote (swapBaseForQuote=true).
 */
export async function quoteSwap({
  handles,
  direction,
  amountIn,
  slippageBps,
}: QuoteArgs): Promise<QuoteResult> {
  const { client, connection } = getDbcClient();
  const swapBaseForQuote = direction === 'sell';

  // currentPoint is needed for rate-limiter / fee-scheduler math.
  const { getCurrentPoint } = await import('@meteora-ag/dynamic-bonding-curve-sdk');
  const currentPoint = await getCurrentPoint(
    connection,
    handles.config.activationType,
  );

  const result: SwapQuote2Result = client.pool.swapQuote2({
    virtualPool: handles.pool,
    config: handles.config,
    swapBaseForQuote,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint,
    slippageBps,
    swapMode: SwapMode.ExactIn,
    amountIn,
  } as any);

  // SwapResult2 has `amountOut`/`outputAmount` style field names; we read both
  // defensively because the SDK has shifted naming between minor versions.
  const out =
    (result as any).amountOut ??
    (result as any).outputAmount ??
    (result as any).output ??
    new BN(0);
  const minOut = result.minimumAmountOut ?? out;

  return {
    amountOut: out.toString(),
    minimumAmountOut: minOut.toString(),
  };
}

interface BuildTxArgs {
  handles: PoolHandles;
  direction: SwapDirection;
  amountIn: BN;
  minimumAmountOut: BN;
  ownerAddress: string;
}

/**
 * Build the swap2 transaction (ExactIn) and serialise unsigned. Caller signs
 * with the user's wallet and submits.
 */
export async function buildSwapTx({
  handles,
  direction,
  amountIn,
  minimumAmountOut,
  ownerAddress,
}: BuildTxArgs): Promise<{ serializedTx: string; blockhash: string; lastValidBlockHeight: number }> {
  const { client, connection } = getDbcClient();
  let owner: PublicKey;
  try {
    owner = new PublicKey(ownerAddress);
  } catch {
    throw new Error('invalid_wallet_address');
  }

  const params: Swap2Params = {
    owner,
    pool: handles.poolAddress,
    swapBaseForQuote: direction === 'sell',
    referralTokenAccount: null,
    payer: owner,
    swapMode: SwapMode.ExactIn,
    amountIn,
    minimumAmountOut,
  };

  const tx: Transaction = await client.pool.swap2(params);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = owner;

  const serializedTx = tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString('base64');

  return { serializedTx, blockhash, lastValidBlockHeight };
}
