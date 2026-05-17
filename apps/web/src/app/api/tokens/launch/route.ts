import { NextResponse } from 'next/server';
import { Keypair, PublicKey } from '@solana/web3.js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDbcClient, getPlatformConfigAddress } from '@/lib/tokens/dbc';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Body = {
  gameId?: string;
  ticker?: string;
  name?: string;
  imageUrl?: string;
};

const TICKER_RE = /^[A-Z0-9]{2,10}$/;

export async function POST(request: Request) {
  // Each launch builds a real on-chain tx + spends 10 credits; keep this tight.
  const rl = checkRateLimit('tokens:launch', clientIp(request), 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many launch requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to launch a token', code: 'auth_required' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const gameId = body?.gameId?.trim();
  const ticker = body?.ticker?.trim().toUpperCase();
  const tokenName = body?.name?.trim();
  if (!gameId || !ticker || !tokenName) {
    return NextResponse.json({ error: 'Missing gameId, ticker, or name' }, { status: 400 });
  }
  if (!TICKER_RE.test(ticker)) {
    return NextResponse.json(
      { error: 'Ticker must be 2-10 uppercase letters or digits' },
      { status: 400 },
    );
  }
  if (tokenName.length > 32) {
    return NextResponse.json({ error: 'Token name max 32 characters' }, { status: 400 });
  }

  const userWallet = user.user_metadata?.wallet_address as string | undefined;
  if (!userWallet) {
    return NextResponse.json({ error: 'No wallet linked to this account' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Confirm ownership and not already tokenized
  const { data: game, error: gameErr } = await admin
    .from('published_games')
    .select('id, user_id, name, is_tokenized')
    .eq('id', gameId)
    .maybeSingle<{ id: string; user_id: string; name: string; is_tokenized: boolean | null }>();
  if (gameErr || !game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }
  if (game.user_id !== user.id) {
    return NextResponse.json({ error: 'Not your game' }, { status: 403 });
  }
  if (game.is_tokenized) {
    return NextResponse.json({ error: 'Game already has a token' }, { status: 409 });
  }

  let configAddress: string;
  try {
    configAddress = getPlatformConfigAddress();
  } catch {
    return NextResponse.json(
      {
        error: 'Token launches are temporarily unavailable. Check back shortly.',
        code: 'platform_not_configured',
      },
      { status: 503 },
    );
  }

  let payerPk: PublicKey;
  try {
    payerPk = new PublicKey(userWallet);
  } catch {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  const { connection, client } = getDbcClient();
  const mintKeypair = Keypair.generate();

  // Token URI: prefer client-provided imageUrl; else fall back to game's slug-based metadata URL
  // (a richer flow would publish a JSON metadata file pointing at imageUrl + name)
  const uri = body?.imageUrl?.trim() || `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/tokens/metadata/${gameId}`;

  let tx;
  try {
    tx = await client.pool.createPool({
      baseMint: mintKeypair.publicKey,
      config: new PublicKey(configAddress),
      name: tokenName,
      symbol: ticker,
      uri,
      payer: payerPk,
      poolCreator: payerPk,
    });
  } catch (err) {
    console.error('createPool tx build failed', err);
    const msg = err instanceof Error ? err.message : 'Failed to build launch transaction';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Set recent blockhash + fee payer; partial-sign with mint keypair (server-side secret).
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = payerPk;
  tx.partialSign(mintKeypair);

  const serialized = tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString('base64');

  return NextResponse.json({
    serializedTx: serialized,
    mintAddress: mintKeypair.publicKey.toBase58(),
    configAddress,
    blockhash,
    lastValidBlockHeight,
  });
}
