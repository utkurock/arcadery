import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CreditReason } from './config';

export class InsufficientCreditsError extends Error {
  constructor() {
    super('insufficient_credits');
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * Atomically debit credits from a user. Throws InsufficientCreditsError if balance too low.
 * Returns the new balance after the debit.
 */
export async function spendCredits(params: {
  userId: string;
  amount: number;
  reason: CreditReason;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('spend_credits', {
    p_user_id: params.userId,
    p_amount: params.amount,
    p_reason: params.reason,
    p_metadata: params.metadata ?? {},
  });
  if (error) {
    if (error.message?.includes('insufficient_credits')) {
      throw new InsufficientCreditsError();
    }
    throw new Error(`spend_credits failed: ${error.message}`);
  }
  return data as number;
}

/**
 * Atomically credit the user. Returns the new balance.
 */
export async function grantCredits(params: {
  userId: string;
  amount: number;
  reason: CreditReason;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('grant_credits', {
    p_user_id: params.userId,
    p_amount: params.amount,
    p_reason: params.reason,
    p_metadata: params.metadata ?? {},
  });
  if (error) throw new Error(`grant_credits failed: ${error.message}`);
  return data as number;
}

export class DuplicatePurchaseError extends Error {
  constructor() {
    super('duplicate_purchase');
    this.name = 'DuplicatePurchaseError';
  }
}

/**
 * Atomically record a Solana SPL purchase AND grant credits in one DB transaction.
 * Throws DuplicatePurchaseError if the tx signature was already used (idempotent replay).
 */
export async function recordPurchase(params: {
  userId: string;
  txSignature: string;
  walletAddress: string;
  paymentMint: string;
  amountBaseUnits: number;
  credits: number;
  tierId?: string;
}): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('record_purchase', {
    p_user_id: params.userId,
    p_tx_signature: params.txSignature,
    p_wallet_address: params.walletAddress,
    p_payment_mint: params.paymentMint,
    p_amount_base_units: params.amountBaseUnits,
    p_credits: params.credits,
    p_tier_id: params.tierId ?? null,
  });
  if (error) {
    if (error.code === '23505' || /duplicate|unique/i.test(error.message ?? '')) {
      throw new DuplicatePurchaseError();
    }
    throw new Error(`record_purchase failed: ${error.message}`);
  }
  return data as number;
}

/**
 * Read current balance (admin bypasses RLS). Returns 0 if no row exists yet.
 */
export async function getBalance(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('user_credits')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle<{ balance: number }>();
  if (error) throw new Error(`balance lookup failed: ${error.message}`);
  return data?.balance ?? 0;
}
