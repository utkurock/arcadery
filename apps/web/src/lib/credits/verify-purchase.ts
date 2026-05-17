import 'server-only';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

export type VerifiedPurchase = {
  signature: string;
  payer: string;
  recipient: string;
  mint: string;
  amountBaseUnits: number;
};

export class PurchaseVerificationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'PurchaseVerificationError';
  }
}

/**
 * Verify an SPL token transfer: the given signature must contain a transfer of
 * at least `expectedAmount` base units of `expectedMint` into the treasury's ATA.
 * We check via pre/post token balances on the treasury's ATA — mint-agnostic and
 * works for TransferChecked, Transfer, or any instruction that moves tokens.
 */
export async function verifyUsdcPurchaseTx(params: {
  signature: string;
  expectedTreasury: string;
  expectedMint: string;
  expectedAmount: number; // base units
  rpcUrl: string;
}): Promise<VerifiedPurchase> {
  const { signature, expectedTreasury, expectedMint, expectedAmount, rpcUrl } = params;

  if (!signature || signature.length < 40 || signature.length > 128) {
    throw new PurchaseVerificationError('bad_signature', 'Invalid signature format');
  }

  let treasuryPk: PublicKey;
  let mintPk: PublicKey;
  try {
    treasuryPk = new PublicKey(expectedTreasury);
    mintPk = new PublicKey(expectedMint);
  } catch {
    throw new PurchaseVerificationError('bad_config', 'Treasury or mint address misconfigured');
  }

  const treasuryAta = getAssociatedTokenAddressSync(mintPk, treasuryPk);

  const connection = new Connection(rpcUrl, 'confirmed');
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    throw new PurchaseVerificationError('not_found', 'Transaction not found or not confirmed yet');
  }
  if (tx.meta?.err) {
    throw new PurchaseVerificationError('tx_failed', 'Transaction failed on-chain');
  }

  // Resolve account keys (handles both legacy and v0 transactions)
  const message = tx.transaction.message;
  const accountKeys = message.getAccountKeys
    ? message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses }).staticAccountKeys
    : (message as unknown as { accountKeys: PublicKey[] }).accountKeys;

  const treasuryAtaIndex = accountKeys.findIndex((k) => k.equals(treasuryAta));
  if (treasuryAtaIndex === -1) {
    throw new PurchaseVerificationError(
      'treasury_ata_missing',
      'Treasury USDC account is not a participant in this tx',
    );
  }

  // Pre/post token balances on treasury ATA
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];

  const preEntry = pre.find((b) => b.accountIndex === treasuryAtaIndex);
  const postEntry = post.find((b) => b.accountIndex === treasuryAtaIndex);
  if (!postEntry) {
    throw new PurchaseVerificationError(
      'no_token_balance',
      'No post token balance for treasury ATA',
    );
  }
  if (postEntry.mint !== expectedMint) {
    throw new PurchaseVerificationError(
      'wrong_mint',
      `Treasury ATA holds mint ${postEntry.mint}, expected ${expectedMint}`,
    );
  }

  const preAmount = BigInt(preEntry?.uiTokenAmount.amount ?? '0');
  const postAmount = BigInt(postEntry.uiTokenAmount.amount);
  const received = postAmount - preAmount;

  if (received < BigInt(expectedAmount)) {
    throw new PurchaseVerificationError(
      'underpaid',
      `Expected ≥${expectedAmount} base units, got ${received}`,
    );
  }

  // Payer = fee payer = first signer = account index 0
  const payer = accountKeys[0];
  if (!payer) {
    throw new PurchaseVerificationError('no_payer', 'Could not identify payer');
  }

  return {
    signature,
    payer: payer.toBase58(),
    recipient: treasuryPk.toBase58(),
    mint: expectedMint,
    amountBaseUnits: Number(received),
  };
}
