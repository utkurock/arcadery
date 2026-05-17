import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { defaultRpcUrlForCluster } from '@/lib/credits/config';

export const FLY_BIRDS_ENTRY_LAMPORTS = 1_000_000; // 0.001 SOL — what entry costs.

const treasuryPub = process.env.NEXT_PUBLIC_TREASURY_WALLET;

export function getTreasuryPubkey(): PublicKey {
  if (!treasuryPub || treasuryPub === '11111111111111111111111111111111') {
    throw new Error('NEXT_PUBLIC_TREASURY_WALLET not configured');
  }
  return new PublicKey(treasuryPub);
}

/**
 * The treasury secret is only required when paying out a winner. Entry-record
 * and score-submit work without it; they only need the public key for
 * verification. Returning null lets the claim endpoint surface a useful error
 * ("server treasury keypair not configured") instead of crashing.
 */
export function getTreasuryKeypair(): Keypair | null {
  const raw = process.env.FLY_BIRDS_TREASURY_SECRET_KEY;
  if (!raw) return null;
  try {
    // Accept base58 (Phantom export format) or JSON array (solana-keygen format).
    if (raw.trim().startsWith('[')) {
      const arr = JSON.parse(raw) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    return Keypair.fromSecretKey(bs58.decode(raw.trim()));
  } catch (err) {
    console.error('[fly-birds] treasury secret key decode failed', err);
    return null;
  }
}

export function getRpcConnection(): Connection {
  const url =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    defaultRpcUrlForCluster(process.env.NEXT_PUBLIC_SOLANA_CLUSTER);
  return new Connection(url, 'confirmed');
}

/**
 * Verify that a signature represents a SOL transfer from `payer` to the
 * configured treasury of at least the entry amount. Returns true on success,
 * false on any mismatch — the caller decides how to surface the error.
 */
export async function verifyEntrySignature(
  signature: string,
  payerPubkey: PublicKey,
): Promise<boolean> {
  try {
    const conn = getRpcConnection();
    const tx = await conn.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
    if (!tx || tx.meta?.err) return false;

    const treasury = getTreasuryPubkey();
    const accountKeys =
      tx.transaction.message.getAccountKeys?.() ??
      ('staticAccountKeys' in tx.transaction.message
        ? { staticAccountKeys: tx.transaction.message.staticAccountKeys }
        : null);
    if (!accountKeys) return false;
    const keys: PublicKey[] = (accountKeys as { staticAccountKeys: PublicKey[] }).staticAccountKeys;

    const payerIdx = keys.findIndex((k) => k.equals(payerPubkey));
    const treasuryIdx = keys.findIndex((k) => k.equals(treasury));
    if (payerIdx < 0 || treasuryIdx < 0) return false;

    const pre = tx.meta?.preBalances ?? [];
    const post = tx.meta?.postBalances ?? [];
    if (pre.length !== post.length) return false;

    // Treasury credit must cover entry; payer must have been the one debited.
    const treasuryDelta = (post[treasuryIdx] ?? 0) - (pre[treasuryIdx] ?? 0);
    const payerDelta = (post[payerIdx] ?? 0) - (pre[payerIdx] ?? 0);
    if (treasuryDelta < FLY_BIRDS_ENTRY_LAMPORTS) return false;
    if (payerDelta >= 0) return false;

    return true;
  } catch (err) {
    console.error('[fly-birds] verifyEntrySignature error', err);
    return false;
  }
}
