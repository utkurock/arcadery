import { NextResponse } from 'next/server';
import {
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  ConfigError,
  getConnection,
  getRewardAuthorityKeypair,
  getRewardMintPubkey,
} from '@/lib/drift-racer/server';
import {
  driftRewardBaseUnits,
  DRIFT_REWARD_AMOUNTS,
  publicRewardMint,
} from '@/lib/drift-racer/config';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

type ClaimBody = {
  wallet?: string;
  scoreId?: string;
};

/**
 * POST /api/games/drift-racer/claim
 *   Body: { wallet, scoreId }
 *
 *   Looks up the score, decides the reward tier (win vs loss), and on first
 *   claim mints the reward to the player's ATA on the configured devnet mint.
 *   Idempotent per wallet: a second call returns the original signature.
 */
export async function POST(request: Request) {
  const rl = checkRateLimit('drift:claim', clientIp(request), 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many claim attempts.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  if (!publicRewardMint()) {
    return NextResponse.json(
      {
        error: 'Token rewards are temporarily unavailable.',
        code: 'reward_not_configured',
      },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as ClaimBody | null;
  const walletStr = body?.wallet?.trim();
  const scoreId = body?.scoreId?.trim();
  if (!walletStr || !scoreId) {
    return NextResponse.json(
      { error: 'Missing wallet or scoreId' },
      { status: 400 },
    );
  }

  let player: PublicKey;
  try {
    player = new PublicKey(walletStr);
  } catch {
    return NextResponse.json({ error: 'Invalid wallet pubkey' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Look up the score the player is claiming against.
  const { data: score, error: scoreErr } = await admin
    .from('drift_racer_scores')
    .select('id, wallet_address, won, drift_score')
    .eq('id', scoreId)
    .maybeSingle<{
      id: string;
      wallet_address: string;
      won: boolean;
      drift_score: number;
    }>();
  if (scoreErr || !score) {
    return NextResponse.json({ error: 'Score not found' }, { status: 404 });
  }
  if (score.wallet_address !== walletStr) {
    return NextResponse.json(
      { error: 'This score belongs to a different wallet.' },
      { status: 403 },
    );
  }

  // Idempotency: one claim per wallet.
  const { data: prior } = await admin
    .from('drift_racer_claims')
    .select('wallet_address, signature, amount_base_units, created_at')
    .eq('wallet_address', walletStr)
    .maybeSingle<{
      wallet_address: string;
      signature: string;
      amount_base_units: number;
      created_at: string;
    }>();
  if (prior) {
    return NextResponse.json({
      ok: true,
      alreadyClaimed: true,
      signature: prior.signature,
      amountBaseUnits: String(prior.amount_base_units),
    });
  }

  const category: keyof typeof DRIFT_REWARD_AMOUNTS = score.won ? 'win' : 'loss';
  const amount = driftRewardBaseUnits(category);

  // Build + send mint instruction server-side.
  let mint: PublicKey;
  let authority;
  try {
    mint = getRewardMintPubkey();
    authority = getRewardAuthorityKeypair();
  } catch (err) {
    if (err instanceof ConfigError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 503 },
      );
    }
    throw err;
  }

  const connection = getConnection();
  const playerAta = await getAssociatedTokenAddress(mint, player);

  const tx = new Transaction();
  try {
    await getAccount(connection, playerAta);
    // ATA exists — skip create.
  } catch {
    tx.add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey, // payer of ATA rent
        playerAta,
        player,
        mint,
      ),
    );
  }
  tx.add(
    createMintToInstruction(
      mint,
      playerAta,
      authority.publicKey,
      amount,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );

  let signature: string;
  try {
    signature = await sendAndConfirmTransaction(connection, tx, [authority], {
      commitment: 'confirmed',
    });
  } catch (err) {
    console.error('drift mint failed', err);
    const msg = err instanceof Error ? err.message : 'mint failed';
    return NextResponse.json(
      { error: `Could not mint reward: ${msg}` },
      { status: 500 },
    );
  }

  // Record the claim. If this insert fails we still consider the mint a
  // success — the on-chain tokens already exist; another claim attempt would
  // see prior=null and try to mint a second time, so log this loudly.
  const { error: claimInsertErr } = await admin
    .from('drift_racer_claims')
    .insert({
      wallet_address: walletStr,
      score_id: score.id,
      signature,
      amount_base_units: Number(amount),
    });
  if (claimInsertErr) {
    console.error(
      `drift claim insert failed AFTER successful mint sig=${signature}`,
      claimInsertErr,
    );
  }

  return NextResponse.json({
    ok: true,
    alreadyClaimed: false,
    signature,
    amountBaseUnits: String(amount),
  });
}
