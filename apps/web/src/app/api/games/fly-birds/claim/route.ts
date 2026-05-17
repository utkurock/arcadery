import { NextRequest } from 'next/server';
import {
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getRpcConnection,
  getTreasuryKeypair,
  getTreasuryPubkey,
} from '@/lib/games/fly-birds';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

// Reserve a small amount in the treasury for rent + fee buffer so we never
// drain the wallet to zero (which would orphan future entries).
const PAYOUT_RESERVE_LAMPORTS = 5_000;

export async function POST(req: NextRequest) {
  let body: { wallet?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { wallet } = body;
  if (!wallet) return Response.json({ error: 'Missing wallet' }, { status: 400 });

  const rl = checkRateLimit('fly-birds:claim', clientIp(req), 5, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: 'Too many claim attempts' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  let winnerKey: PublicKey;
  try {
    winnerKey = new PublicKey(wallet);
  } catch {
    return Response.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: round } = await supabase.rpc('fly_birds_active_round');
  if (!round) {
    return Response.json({ error: 'No active round' }, { status: 404 });
  }
  const poolLamports = Number(round.pool_lamports ?? 0);
  if (poolLamports <= 0) {
    return Response.json({ error: 'Pool is empty' }, { status: 400 });
  }

  // Authorization: caller must be the top scorer in the active round.
  const { data: scores } = await supabase
    .from('fly_birds_scores')
    .select('wallet_address, score')
    .eq('round_id', round.id)
    .order('score', { ascending: false })
    .limit(50);

  const bestByWallet = new Map<string, number>();
  for (const s of scores ?? []) {
    const cur = bestByWallet.get(s.wallet_address) ?? 0;
    if (s.score > cur) bestByWallet.set(s.wallet_address, s.score);
  }
  if (bestByWallet.size === 0) {
    return Response.json({ error: 'No scores submitted yet' }, { status: 400 });
  }
  const ranked = Array.from(bestByWallet.entries()).sort((a, b) => b[1] - a[1]);
  const [topWallet] = ranked[0];
  if (topWallet !== wallet) {
    return Response.json(
      { error: 'Only the top scorer can claim the prize pool' },
      { status: 403 },
    );
  }

  const treasury = getTreasuryKeypair();
  if (!treasury) {
    return Response.json(
      {
        error:
          'Treasury keypair not configured on the server. Set FLY_BIRDS_TREASURY_SECRET_KEY to enable payouts.',
        code: 'treasury_not_configured',
      },
      { status: 503 },
    );
  }
  // Sanity: secret matches the public treasury address the frontend is
  // already using, so a misconfigured key can't accidentally drain a
  // different wallet.
  if (!treasury.publicKey.equals(getTreasuryPubkey())) {
    return Response.json(
      { error: 'Server treasury keypair does not match NEXT_PUBLIC_TREASURY_WALLET' },
      { status: 500 },
    );
  }

  const conn = getRpcConnection();
  const balance = await conn.getBalance(treasury.publicKey);
  const payoutLamports = Math.max(0, Math.min(poolLamports, balance - PAYOUT_RESERVE_LAMPORTS));
  if (payoutLamports <= 0) {
    return Response.json({ error: 'Treasury balance is too low to pay out' }, { status: 500 });
  }

  let signature: string;
  try {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: treasury.publicKey,
        toPubkey: winnerKey,
        lamports: payoutLamports,
      }),
    );
    signature = await sendAndConfirmTransaction(conn, tx, [treasury], {
      commitment: 'confirmed',
    });
  } catch (err) {
    console.error('[fly-birds/claim] payout failed', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: `Payout failed: ${msg}` }, { status: 500 });
  }

  // Close the round atomically — refuses if someone else already claimed.
  // The on-chain transfer already happened, so a 409 here means the winner
  // double-claimed; we still return success but log it.
  const { error: closeErr } = await supabase.rpc('fly_birds_close_round', {
    p_round_id: round.id,
    p_winner_wallet: wallet,
    p_claim_signature: signature,
  });
  if (closeErr) {
    console.error('[fly-birds/claim] close_round failed AFTER on-chain payout', closeErr, signature);
  }

  return Response.json({
    ok: true,
    signature,
    payoutLamports,
    roundId: round.id,
  });
}
