import 'server-only';
import { Connection, PublicKey } from '@solana/web3.js';
import { defaultRpcUrlForCluster } from '@/lib/credits/config';
import { BUILTIN_ENTRY_FEE_LAMPORTS } from './config';

// Re-implements the same verify-entry mechanic as drift-racer/server.ts. Kept
// separate (rather than collapsing the two) so per-game tweaks (eg. higher
// entry fee for a future premium title) don't cascade across games.

export function getRpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    defaultRpcUrlForCluster(process.env.NEXT_PUBLIC_SOLANA_CLUSTER)
  );
}

export function getConnection(): Connection {
  return new Connection(getRpcUrl(), 'confirmed');
}

export function getTreasuryPubkey(): PublicKey {
  const v = process.env.NEXT_PUBLIC_TREASURY_WALLET;
  if (!v || v === '11111111111111111111111111111111') {
    throw new ConfigError(
      'treasury_not_configured',
      'Treasury wallet is not configured',
    );
  }
  try {
    return new PublicKey(v);
  } catch {
    throw new ConfigError('treasury_invalid', 'Treasury env is not a valid pubkey');
  }
}

export class ConfigError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class EntryVerificationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'EntryVerificationError';
  }
}

/**
 * Compare pre/post SOL balances of the treasury and confirm a payer-funded
 * transfer of at least the entry fee. The signature must be a confirmed,
 * unfailed transaction the payer is a participant in.
 */
export async function verifyBuiltinEntryTransfer(params: {
  signature: string;
  expectedPayer: string;
  expectedLamports?: number;
}): Promise<{ signature: string; payer: string; receivedLamports: number }> {
  const { signature, expectedPayer } = params;
  const expectedLamports = params.expectedLamports ?? BUILTIN_ENTRY_FEE_LAMPORTS;
  if (!signature || signature.length < 40 || signature.length > 128) {
    throw new EntryVerificationError('bad_signature', 'Invalid signature format');
  }

  const treasury = getTreasuryPubkey();
  let payer: PublicKey;
  try {
    payer = new PublicKey(expectedPayer);
  } catch {
    throw new EntryVerificationError('bad_payer', 'Invalid payer pubkey');
  }

  const conn = getConnection();
  const tx = await conn.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) {
    throw new EntryVerificationError(
      'not_found',
      'Transaction not found or not yet confirmed',
    );
  }
  if (tx.meta?.err) {
    throw new EntryVerificationError('tx_failed', 'Transaction failed on-chain');
  }

  const message = tx.transaction.message;
  const accountKeys = message.getAccountKeys
    ? message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses })
        .staticAccountKeys
    : (message as unknown as { accountKeys: PublicKey[] }).accountKeys;

  const treasuryIdx = accountKeys.findIndex((k) => k.equals(treasury));
  if (treasuryIdx === -1) {
    throw new EntryVerificationError(
      'treasury_missing',
      'Treasury wallet is not a participant in this transaction',
    );
  }
  const payerIdx = accountKeys.findIndex((k) => k.equals(payer));
  if (payerIdx === -1) {
    throw new EntryVerificationError(
      'payer_missing',
      'Payer wallet is not a participant in this transaction',
    );
  }

  const pre = tx.meta?.preBalances ?? [];
  const post = tx.meta?.postBalances ?? [];
  const received = (post[treasuryIdx] ?? 0) - (pre[treasuryIdx] ?? 0);
  if (received < expectedLamports) {
    throw new EntryVerificationError(
      'underpaid',
      `Expected ≥${expectedLamports} lamports, treasury delta was ${received}`,
    );
  }

  return {
    signature,
    payer: payer.toBase58(),
    receivedLamports: received,
  };
}
