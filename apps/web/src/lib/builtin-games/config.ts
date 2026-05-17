// Constants + client-safe helpers shared by every built-in arcade game.
// Drift Racer has its own copy in `lib/drift-racer/config.ts` since it
// shipped first; the values are kept in sync intentionally.

import { LAMPORTS_PER_SOL } from '@solana/web3.js';

export const BUILTIN_ENTRY_FEE_SOL = 0.01;
export const BUILTIN_ENTRY_FEE_LAMPORTS = Math.round(
  BUILTIN_ENTRY_FEE_SOL * LAMPORTS_PER_SOL,
);

const BUILTIN_GAME_KEYS = ['neon-asteroids', 'cube-runner', 'brick-smash'] as const;
export type BuiltinGameKey = (typeof BUILTIN_GAME_KEYS)[number];

/** Client-safe accessor — returns null if unset or set to the all-zero sentinel. */
export function publicTreasuryAddress(): string | null {
  const v = process.env.NEXT_PUBLIC_TREASURY_WALLET;
  if (!v) return null;
  if (v === '11111111111111111111111111111111') return null;
  return v;
}
