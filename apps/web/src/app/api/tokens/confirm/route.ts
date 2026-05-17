import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDbcClient } from '@/lib/tokens/dbc';
import { spendCredits, InsufficientCreditsError } from '@/lib/credits/server';
import { TOKEN_LAUNCH_COST, INSUFFICIENT_CREDITS_STATUS } from '@/lib/credits/config';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Body = {
  gameId?: string;
  txSignature?: string;
  mintAddress?: string;
  ticker?: string;
  tokenName?: string;
  imageUrl?: string;
  configAddress?: string;
};

export async function POST(request: Request) {
  const rl = checkRateLimit('tokens:confirm', clientIp(request), 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in', code: 'auth_required' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const gameId = body?.gameId?.trim();
  const sig = body?.txSignature?.trim();
  const mintAddress = body?.mintAddress?.trim();
  const ticker = body?.ticker?.trim().toUpperCase();
  const tokenName = body?.tokenName?.trim();
  const configAddress = body?.configAddress?.trim();
  if (!gameId || !sig || !mintAddress || !ticker || !tokenName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const userWallet = user.user_metadata?.wallet_address as string | undefined;
  if (!userWallet) {
    return NextResponse.json({ error: 'No wallet linked' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify ownership + not already tokenized
  const { data: game, error: gameErr } = await admin
    .from('published_games')
    .select('id, user_id, is_tokenized, token_mint')
    .eq('id', gameId)
    .maybeSingle<{
      id: string;
      user_id: string;
      is_tokenized: boolean | null;
      token_mint: string | null;
    }>();
  if (gameErr || !game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  if (game.user_id !== user.id)
    return NextResponse.json({ error: 'Not your game' }, { status: 403 });
  if (game.is_tokenized && game.token_mint) {
    return NextResponse.json(
      { error: 'Already tokenized', tokenMint: game.token_mint },
      { status: 409 },
    );
  }

  // Validate the on-chain tx really went through and references this mint
  const { connection } = getDbcClient();
  let mintPk: PublicKey;
  try {
    mintPk = new PublicKey(mintAddress);
  } catch {
    return NextResponse.json({ error: 'Invalid mint address' }, { status: 400 });
  }

  const tx = await connection.getTransaction(sig, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) {
    return NextResponse.json(
      { error: 'Transaction not found or not yet confirmed', code: 'not_found' },
      { status: 404 },
    );
  }
  if (tx.meta?.err) {
    return NextResponse.json(
      { error: 'On-chain transaction failed', code: 'tx_failed' },
      { status: 400 },
    );
  }

  // Confirm the mint pubkey is among the static account keys of the tx
  const message = tx.transaction.message;
  const accountKeys = message.getAccountKeys
    ? message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses }).staticAccountKeys
    : (message as unknown as { accountKeys: PublicKey[] }).accountKeys;
  const mintIncluded = accountKeys.some((k) => k.equals(mintPk));
  if (!mintIncluded) {
    return NextResponse.json(
      { error: 'Mint address not present in this transaction' },
      { status: 400 },
    );
  }
  // Confirm the user is the fee payer (account index 0)
  const payer = accountKeys[0];
  if (!payer || payer.toBase58() !== userWallet) {
    return NextResponse.json(
      { error: 'Transaction payer does not match your wallet' },
      { status: 403 },
    );
  }

  // Charge credits — only after on-chain success is verified
  try {
    await spendCredits({
      userId: user.id,
      amount: TOKEN_LAUNCH_COST,
      reason: 'token_launch',
      metadata: { gameId, mintAddress, ticker, txSignature: sig },
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          error:
            'Token launched on-chain but you do not have enough credits to record it. Top up and call confirm again.',
          code: 'insufficient_credits',
          cost: TOKEN_LAUNCH_COST,
        },
        { status: INSUFFICIENT_CREDITS_STATUS },
      );
    }
    console.error('spend failed', err);
    return NextResponse.json({ error: 'Credit system error' }, { status: 500 });
  }

  // Update published_games — mark as tokenized
  const { error: updateErr } = await admin
    .from('published_games')
    .update({
      is_tokenized: true,
      token_mint: mintAddress,
      token_symbol: ticker,
      token_name: tokenName,
      token_image_url: body?.imageUrl ?? null,
      token_creator_wallet: userWallet,
      token_launched_at: new Date().toISOString(),
      pool_config_address: configAddress ?? null,
      deploy_tx: sig,
      chain: 'solana',
    })
    .eq('id', gameId);

  if (updateErr) {
    console.error('published_games update failed', updateErr);
    return NextResponse.json({ error: 'Failed to update game record' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    tokenMint: mintAddress,
    txSignature: sig,
  });
}
