// Shared constants for the Drift Racer entry-fee + reward pipeline.
//
// Treasury wallet is reused from the platform-wide NEXT_PUBLIC_TREASURY_WALLET
// (same key as fly-birds). The reward mint + authority are drift-specific so
// that token economics can evolve independently of any other game.

import { LAMPORTS_PER_SOL } from '@solana/web3.js';

export const DRIFT_ENTRY_FEE_SOL = 0.01;
export const DRIFT_ENTRY_FEE_LAMPORTS = Math.round(DRIFT_ENTRY_FEE_SOL * LAMPORTS_PER_SOL);

export const DRIFT_REWARD_DECIMALS = 6;
export const DRIFT_REWARD_AMOUNTS = {
  win: 100,
  loss: 25,
} as const;

export function driftRewardBaseUnits(category: keyof typeof DRIFT_REWARD_AMOUNTS): bigint {
  return BigInt(DRIFT_REWARD_AMOUNTS[category]) * BigInt(10 ** DRIFT_REWARD_DECIMALS);
}

/** Client-safe accessor — returns null if unset OR set to the all-zero sentinel. */
export function publicTreasuryAddress(): string | null {
  const v = process.env.NEXT_PUBLIC_TREASURY_WALLET;
  if (!v) return null;
  if (v === '11111111111111111111111111111111') return null;
  return v;
}

/** Client-safe accessor for the reward token mint. */
export function publicRewardMint(): string | null {
  const v = process.env.NEXT_PUBLIC_DRIFT_REWARD_MINT;
  if (!v) return null;
  if (v === '11111111111111111111111111111111') return null;
  return v;
}
