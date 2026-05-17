/**
 * Server-side loader for tokens minted by scripts/launch-game-token.ts.
 *
 * Reads the JSON registry at apps/web/src/lib/tokens/devnet-tokens.json and
 * enriches each entry with live state pulled from the Meteora DBC pool on
 * chain — spot price in SOL/USD, curve progress, and a deterministic mock
 * 24h sparkline (devnet has no real indexer history).
 *
 * Designed for the Next server: never imports browser-only APIs and caches
 * a single SDK client per process to avoid per-request reconnects.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import {
  DynamicBondingCurveClient,
  getPriceFromSqrtPrice,
  TokenDecimal,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
// Static JSON import — bundled at build time, hot-reloads in dev when the
// launch script appends a new row. Avoids fragile process.cwd() resolution.
import registry from './devnet-tokens.json';

// ─── Types ───────────────────────────────────────────────────────────────

type TokenRegistryRow = {
  slug: string;
  name: string;
  symbol: string;
  playHref: string;
  category: string;
  description: string;
  imageUrl?: string;
  mint: string;
  poolAddress: string;
  configAddress: string;
  cluster: string;
  deployTx: string;
  launchedAt: string;
};

export type LiveToken = TokenRegistryRow & {
  priceSol: number; // spot price per 1 base token in SOL
  priceUsd: number; // priceSol * cached SOL/USD
  curveProgress: number; // 0–1 along the bonding curve
  /** Quote reserve (SOL) currently sitting in the bonding curve pool. */
  liquiditySol: number;
  sparkline: number[]; // 24 points, deterministic mock until trades exist
  explorerUrl: string;
  explorerPoolUrl: string;
  /** True when the on-chain pool was readable; false if the read failed. */
  alive: boolean;
};

// ─── Constants ───────────────────────────────────────────────────────────

// Devnet SOL has no real market price; stub a number so USD math doesn't
// break. Swap to a real oracle if/when the live tokens move to mainnet.
const SOL_USD_STUB = 180;

// ─── Cached client ───────────────────────────────────────────────────────

let cached: { conn: Connection; client: DynamicBondingCurveClient } | null = null;
function getClient() {
  if (cached) return cached;
  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
  const conn = new Connection(rpcUrl, 'confirmed');
  const client = new DynamicBondingCurveClient(conn, 'confirmed');
  cached = { conn, client };
  return cached;
}

// ─── Registry IO ─────────────────────────────────────────────────────────

function readRegistry(): TokenRegistryRow[] {
  return Array.isArray(registry) ? (registry as TokenRegistryRow[]) : [];
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function explorerUrl(kind: 'tx' | 'token' | 'address', value: string, cluster: string): string {
  const base = `https://solscan.io/${kind}/${value}`;
  return cluster === 'mainnet-beta' ? base : `${base}?cluster=${cluster}`;
}

// djb2-ish string hash → stable seed for the mock sparkline.
function seed(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return Math.abs(h);
}

function mockSparkline(mintAddress: string, endPrice: number): number[] {
  // 24 points walking from a noisy start price toward the current price so
  // the chart visually "lands" on the live number. Pure visual filler.
  const h = seed(mintAddress);
  const startMultiplier = 0.7 + ((h % 600) / 1000); // 0.7×–1.3× of end price
  const start = endPrice * startMultiplier;
  const pts: number[] = [];
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const jitter = ((seed(mintAddress + ':' + i) % 200) - 100) / 1000; // ±10%
    const v = start + (endPrice - start) * t + endPrice * jitter * (1 - t * 0.5);
    pts.push(Math.max(v, endPrice * 0.05));
  }
  pts[pts.length - 1] = endPrice; // anchor end exactly to current price
  return pts;
}

// ─── Fetch live state ────────────────────────────────────────────────────

async function fetchLive(row: TokenRegistryRow): Promise<LiveToken> {
  const cluster = row.cluster || 'devnet';
  const fallback: LiveToken = {
    ...row,
    priceSol: 0,
    priceUsd: 0,
    curveProgress: 0,
    liquiditySol: 0,
    sparkline: mockSparkline(row.mint, 0.0001),
    explorerUrl: explorerUrl('token', row.mint, cluster),
    explorerPoolUrl: explorerUrl('address', row.poolAddress, cluster),
    alive: false,
  };

  try {
    const { client } = getClient();
    const poolPk = new PublicKey(row.poolAddress);
    const pool = await client.state.getPool(poolPk);
    if (!pool) return fallback;

    // Token decimals come from the DBC config (deploy-dbc-config.ts uses 6).
    // SOL is always 9. The SDK returns Decimal — coerce to number for JSON
    // serialization across the server → client boundary.
    const priceDecimal = getPriceFromSqrtPrice(
      pool.sqrtPrice,
      TokenDecimal.SIX,
      TokenDecimal.NINE,
    );
    const priceSol = Number(priceDecimal.toString());
    const priceUsd = priceSol * SOL_USD_STUB;

    let curveProgress = 0;
    try {
      curveProgress = await client.state.getPoolQuoteTokenCurveProgress(poolPk);
    } catch {
      // Non-fatal — progress is decorative for the chart band.
    }

    // quoteReserve is in lamports; humanize to SOL for display.
    const liquiditySol = Number(pool.quoteReserve.toString()) / 1e9;

    return {
      ...row,
      priceSol,
      priceUsd,
      curveProgress,
      liquiditySol,
      sparkline: mockSparkline(row.mint, priceUsd || priceSol || 0.0001),
      explorerUrl: explorerUrl('token', row.mint, cluster),
      explorerPoolUrl: explorerUrl('address', row.poolAddress, cluster),
      alive: true,
    };
  } catch (err) {
    console.error(`[devnet-loader] ${row.symbol} failed:`, err);
    return fallback;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Load every token in the registry and enrich with on-chain state.
 * Errors per-token are swallowed and surfaced via `alive: false` so a single
 * bad pool can't blank the whole tokens page.
 */
export async function loadLiveTokens(): Promise<LiveToken[]> {
  const rows = readRegistry();
  if (rows.length === 0) return [];
  return Promise.all(rows.map(fetchLive));
}
