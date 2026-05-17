import { NextRequest } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  FLY_BIRDS_ENTRY_LAMPORTS,
  verifyEntrySignature,
} from '@/lib/games/fly-birds';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  let body: { signature?: string; wallet?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { signature, wallet } = body;
  if (!signature || !wallet) {
    return Response.json({ error: 'Missing signature or wallet' }, { status: 400 });
  }

  const rl = checkRateLimit('fly-birds:enter', clientIp(req), 10, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  let payerKey: PublicKey;
  try {
    payerKey = new PublicKey(wallet);
  } catch {
    return Response.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  const ok = await verifyEntrySignature(signature, payerKey);
  if (!ok) {
    return Response.json(
      { error: 'On-chain verification failed — signature did not transfer 0.001 SOL to treasury' },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data: roundId, error } = await supabase.rpc('fly_birds_record_entry', {
    p_signature: signature,
    p_wallet: wallet,
    p_lamports: FLY_BIRDS_ENTRY_LAMPORTS,
  });

  if (error) {
    console.error('[fly-birds/enter] record_entry failed', error);
    return Response.json({ error: 'Failed to record entry' }, { status: 500 });
  }

  return Response.json({ ok: true, roundId });
}
