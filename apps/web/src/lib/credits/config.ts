// USDC on Solana: 6 decimals. 1 USDC = 1_000_000 base units.
export const USDC_DECIMALS = 6;
const USDC = (usd: number): number => Math.round(usd * 10 ** USDC_DECIMALS);

export type PricingTier = {
  id: 'starter' | 'pro';
  label: string;
  credits: number;
  usdcAmount: number; // base units (6 decimals)
  usdLabel: string;
  perCreditUsd: number;
  badge?: string;
};

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    id: 'starter',
    label: 'Starter',
    credits: 25,
    usdcAmount: USDC(20),
    usdLabel: '$20',
    perCreditUsd: 20 / 25,
  },
  {
    id: 'pro',
    label: 'Pro',
    credits: 100,
    usdcAmount: USDC(75),
    usdLabel: '$75',
    perCreditUsd: 75 / 100,
    badge: 'Best value',
  },
];

export function getTier(id: string): PricingTier | undefined {
  return PRICING_TIERS.find((t) => t.id === id);
}

export const WELCOME_BONUS = 5;

export const AI_GENERATE_COST = 1;
export const AI_IMAGE_COST = 3;
export const AI_SPRITE_SHEET_COST = 5;
export const AI_ANIMATION_COST = 6;
export const AI_IMAGE_EDIT_COST = 2;
export const TOKEN_LAUNCH_COST = 10;

export type CreditReason =
  | 'purchase'
  | 'welcome'
  | 'ai_generate'
  | 'ai_plan'
  | 'ai_image'
  | 'token_launch'
  | 'refund'
  | 'admin_grant'
  | 'admin_debit';

export const INSUFFICIENT_CREDITS_STATUS = 402;

// USDC mint addresses per cluster. Client reads NEXT_PUBLIC_USDC_MINT.
const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

/** Cluster-aware fallback. Use when NEXT_PUBLIC_USDC_MINT is unset. */
export function defaultUsdcMintForCluster(cluster: string | undefined): string {
  return cluster === 'devnet' ? USDC_MINT_DEVNET : USDC_MINT_MAINNET;
}

/** Cluster-aware fallback. Use when NEXT_PUBLIC_SOLANA_RPC_URL is unset. */
export function defaultRpcUrlForCluster(cluster: string | undefined): string {
  return cluster === 'devnet'
    ? 'https://api.devnet.solana.com'
    : 'https://api.mainnet-beta.solana.com';
}
