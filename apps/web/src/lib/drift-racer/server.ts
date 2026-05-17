import 'server-only';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { defaultRpcUrlForCluster } from '@/lib/credits/config';

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
      'Drift Racer treasury wallet is not configured',
    );
  }
  try {
    return new PublicKey(v);
  } catch {
    throw new ConfigError('treasury_invalid', 'Treasury env is not a valid pubkey');
  }
}

export function getRewardMintPubkey(): PublicKey {
  const v = process.env.NEXT_PUBLIC_DRIFT_REWARD_MINT;
  if (!v) {
    throw new ConfigError(
      'reward_mint_not_configured',
      'Drift reward mint is not configured',
    );
  }
  try {
    return new PublicKey(v);
  } catch {
    throw new ConfigError('reward_mint_invalid', 'Drift reward mint env is not a valid pubkey');
  }
}

/**
 * Server-only keypair that holds mint authority for the reward token.
 * Stored as a base58 secret. Devnet only — never ship a mainnet key in env.
 */
export function getRewardAuthorityKeypair(): Keypair {
  const secret = process.env.DRIFT_REWARD_AUTHORITY_SECRET;
  if (!secret) {
    throw new ConfigError(
      'reward_authority_not_configured',
      'Drift reward mint authority secret is not configured',
    );
  }
  let bytes: Uint8Array;
  try {
    // Accept either base58 (Phantom export) or JSON array (solana-keygen).
    const trimmed = secret.trim();
    if (trimmed.startsWith('[')) {
      const arr = JSON.parse(trimmed) as number[];
      bytes = Uint8Array.from(arr);
    } else {
      bytes = bs58.decode(trimmed);
    }
  } catch {
    throw new ConfigError(
      'reward_authority_invalid',
      'DRIFT_REWARD_AUTHORITY_SECRET could not be decoded (base58 or JSON array)',
    );
  }
  if (bytes.length !== 64) {
    throw new ConfigError(
      'reward_authority_invalid',
      'DRIFT_REWARD_AUTHORITY_SECRET must decode to a 64-byte ed25519 secret key',
    );
  }
  return Keypair.fromSecretKey(bytes);
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
 * Verify a SystemProgram.transfer signature paid the drift treasury at least
 * `expectedLamports`, from `expectedPayer`. We compare pre/post SOL balances
 * on the treasury account index — that's mint-agnostic and works for v0 + legacy.
 */
export async function verifyEntryTransfer(params: {
  signature: string;
  expectedPayer: string;
  expectedLamports: number;
}): Promise<{ signature: string; payer: string; receivedLamports: number }> {
  const { signature, expectedPayer, expectedLamports } = params;
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
    ? message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses }).staticAccountKeys
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
