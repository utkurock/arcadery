import { Connection } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { defaultRpcUrlForCluster } from '@/lib/credits/config';

let cached: { connection: Connection; client: DynamicBondingCurveClient } | null = null;

export function getDbcClient(): { connection: Connection; client: DynamicBondingCurveClient } {
  if (cached) return cached;
  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    defaultRpcUrlForCluster(process.env.NEXT_PUBLIC_SOLANA_CLUSTER);
  const connection = new Connection(rpcUrl, 'confirmed');
  const client = new DynamicBondingCurveClient(connection, 'confirmed');
  cached = { connection, client };
  return cached;
}

export const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';

// Platform DBC config — must be deployed once via scripts/deploy-dbc-config.ts.
// Stored in env so the server can build launch txs against it.
export function getPlatformConfigAddress(): string {
  const addr = process.env.DBC_CONFIG_ADDRESS;
  if (!addr) {
    throw new Error(
      'DBC_CONFIG_ADDRESS not set. Run scripts/deploy-dbc-config.ts to deploy a platform config.',
    );
  }
  return addr;
}
