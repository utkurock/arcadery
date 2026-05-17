import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getDbcClient,
  getPlatformConfigAddress,
  NATIVE_SOL_MINT,
} from '@/lib/tokens/dbc';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/tokens/claim
 *
 * Builds a partial-signed claim transaction for a tokenized game's CREATOR
 * trading fee accumulated on Meteora DBC. The client wallet (the game's
 * owner) signs and submits it; the SOL fees land directly in their wallet.
 *
 * Platform's 30% share is claimed by the admin wallet (DBC_FEE_CLAIMER_ADDRESS)
 * out-of-band via the deploy admin keypair — not exposed as an in-app action.
 */

type Body = { gameId?: string };

export async function POST(request: Request) {
  const rl = checkRateLimit('tokens:claim', clientIp(request), 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many claim requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to claim earnings', code: 'auth_required' },
      { status: 401 },
    );
  }

  const userWallet = user.user_metadata?.wallet_address as string | undefined;
  if (!userWallet) {
    return NextResponse.json({ error: 'No wallet linked to this account' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const gameId = body?.gameId?.trim();
  if (!gameId) {
    return NextResponse.json({ error: 'Missing gameId' }, { status: 400 });
  }

  // Ownership + tokenization check
  const admin = createAdminClient();
  const { data: game, error: gameErr } = await admin
    .from('published_games')
    .select('id, user_id, is_tokenized, token_mint, token_creator_wallet')
    .eq('id', gameId)
    .maybeSingle<{
      id: string;
      user_id: string;
      is_tokenized: boolean | null;
      token_mint: string | null;
      token_creator_wallet: string | null;
    }>();
  if (gameErr || !game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  if (game.user_id !== user.id) {
    return NextResponse.json({ error: 'Not your game' }, { status: 403 });
  }
  if (!game.is_tokenized || !game.token_mint) {
    return NextResponse.json(
      { error: 'This game has no token to claim from yet' },
      { status: 400 },
    );
  }
  if (game.token_creator_wallet && game.token_creator_wallet !== userWallet) {
    return NextResponse.json(
      { error: 'Connected wallet does not match the token creator wallet' },
      { status: 403 },
    );
  }

  // Resolve platform config + derive the bonding curve pool address.
  let configAddress: string;
  try {
    configAddress = getPlatformConfigAddress();
  } catch {
    return NextResponse.json(
      {
        error: 'Token launches are temporarily unavailable.',
        code: 'platform_not_configured',
      },
      { status: 503 },
    );
  }

  let mintPk: PublicKey;
  let payerPk: PublicKey;
  let configPk: PublicKey;
  try {
    mintPk = new PublicKey(game.token_mint);
    payerPk = new PublicKey(userWallet);
    configPk = new PublicKey(configAddress);
  } catch {
    return NextResponse.json({ error: 'Invalid stored addresses' }, { status: 500 });
  }
  const quoteMint = new PublicKey(NATIVE_SOL_MINT);
  const pool = deriveDbcPoolAddress(quoteMint, mintPk, configPk);

  const { connection, client } = getDbcClient();

  let tx;
  try {
    tx = await client.creator.claimCreatorTradingFee({
      creator: payerPk,
      payer: payerPk,
      pool,
      // BN.max-ish — claim everything available. Meteora caps to the actual
      // accrued amount on-chain, so passing a huge number is the canonical
      // "claim all" idiom.
      maxBaseAmount: new BN('18446744073709551615'),
      maxQuoteAmount: new BN('18446744073709551615'),
      receiver: payerPk,
    });
  } catch (err) {
    console.error('claimCreatorTradingFee tx build failed', err);
    const msg = err instanceof Error ? err.message : 'Failed to build claim transaction';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = payerPk;

  const serialized = tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString('base64');

  return NextResponse.json({
    serializedTx: serialized,
    pool: pool.toBase58(),
    blockhash,
    lastValidBlockHeight,
  });
}
