import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyUsdcPurchaseTx, PurchaseVerificationError } from '@/lib/credits/verify-purchase';
import { recordPurchase, DuplicatePurchaseError, getBalance } from '@/lib/credits/server';
import { getTier, defaultUsdcMintForCluster, defaultRpcUrlForCluster } from '@/lib/credits/config';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const rl = checkRateLimit('credits:purchase', clientIp(request), 20, 60_000);
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
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const walletAddress = user.user_metadata?.wallet_address as string | undefined;
  if (!walletAddress) {
    return NextResponse.json({ error: 'No wallet linked to this account' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as
    | { signature?: string; tierId?: string }
    | null;
  const signature = body?.signature?.trim();
  const tierId = body?.tierId?.trim();
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }
  if (!tierId) {
    return NextResponse.json({ error: 'Missing tierId' }, { status: 400 });
  }
  const tier = getTier(tierId);
  if (!tier) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }

  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  const treasury = process.env.NEXT_PUBLIC_TREASURY_WALLET;
  const mint = process.env.NEXT_PUBLIC_USDC_MINT || defaultUsdcMintForCluster(cluster);
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || defaultRpcUrlForCluster(cluster);
  if (!treasury) {
    return NextResponse.json({ error: 'Treasury wallet not configured' }, { status: 500 });
  }

  let verified;
  try {
    verified = await verifyUsdcPurchaseTx({
      signature,
      expectedTreasury: treasury,
      expectedMint: mint,
      expectedAmount: tier.usdcAmount,
      rpcUrl,
    });
  } catch (err) {
    if (err instanceof PurchaseVerificationError) {
      const status = err.code === 'not_found' ? 404 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error('verify failed', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }

  if (verified.payer !== walletAddress) {
    return NextResponse.json(
      { error: 'Transaction payer does not match signed-in wallet', code: 'payer_mismatch' },
      { status: 403 },
    );
  }

  try {
    const balance = await recordPurchase({
      userId: user.id,
      txSignature: verified.signature,
      walletAddress: verified.payer,
      paymentMint: verified.mint,
      amountBaseUnits: verified.amountBaseUnits,
      credits: tier.credits,
      tierId: tier.id,
    });
    return NextResponse.json({
      balance,
      creditsGranted: tier.credits,
      tierId: tier.id,
      txSignature: verified.signature,
    });
  } catch (err) {
    if (err instanceof DuplicatePurchaseError) {
      const balance = await getBalance(user.id);
      return NextResponse.json({
        balance,
        creditsGranted: 0,
        tierId: tier.id,
        txSignature: verified.signature,
        alreadyCredited: true,
      });
    }
    console.error('recordPurchase failed', err);
    return NextResponse.json({ error: 'Failed to record purchase' }, { status: 500 });
  }
}
