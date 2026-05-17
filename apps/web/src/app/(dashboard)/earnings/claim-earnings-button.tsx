'use client';

import { useState } from 'react';
import { Connection, Transaction } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { defaultRpcUrlForCluster } from '@/lib/credits/config';

/**
 * In-app claim flow for a tokenized game's creator trading fees.
 *
 *   1. POST /api/tokens/claim — server builds the partial-signed Meteora tx
 *   2. Client wallet signs (no platform secret involved; fees go straight to
 *      the user's wallet)
 *   3. Submit to RPC, wait for confirmation
 *
 * Errors are surfaced via a toast. No DB write needed — the on-chain transfer
 * is the source of truth and Meteora resets the claimable amount itself.
 */
export function ClaimEarningsButton({ gameId }: { gameId: string }) {
  const { publicKey, signTransaction, connected } = useWallet();
  const [phase, setPhase] = useState<'idle' | 'building' | 'signing' | 'submitting' | 'done'>(
    'idle',
  );

  async function handleClaim() {
    if (!connected || !publicKey || !signTransaction) {
      toast.error('Connect your wallet to claim');
      return;
    }

    try {
      setPhase('building');
      const res = await fetch('/api/tokens/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameId }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to build claim transaction');
      }
      const { serializedTx, lastValidBlockHeight } = (await res.json()) as {
        serializedTx: string;
        blockhash: string;
        lastValidBlockHeight: number;
      };

      const tx = Transaction.from(Buffer.from(serializedTx, 'base64'));
      setPhase('signing');
      const signed = await signTransaction(tx);

      setPhase('submitting');
      const rpcUrl =
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
        defaultRpcUrlForCluster(process.env.NEXT_PUBLIC_SOLANA_CLUSTER);
      const connection = new Connection(rpcUrl, 'confirmed');
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
      // Block-height-aware wait — handles the case where the tx never lands
      // before the blockhash expires, instead of hanging forever.
      const confirmation = await connection.confirmTransaction(
        { signature: sig, blockhash: signed.recentBlockhash!, lastValidBlockHeight },
        'confirmed',
      );
      if (confirmation.value.err) {
        throw new Error(`Tx failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
      }

      setPhase('done');
      toast.success('Earnings claimed to your wallet', {
        description: sig.slice(0, 12) + '…',
      });
      setTimeout(() => setPhase('idle'), 3000);
    } catch (err) {
      setPhase('idle');
      const msg = err instanceof Error ? err.message : 'Claim failed';
      // Meteora returns a specific error when there's nothing accrued yet —
      // map it to a friendlier message rather than the raw program error.
      if (/no.*fee|insufficient/i.test(msg)) {
        toast('No fees to claim yet', {
          description: 'Trading activity will accumulate fees you can claim later.',
        });
      } else {
        toast.error(msg);
      }
    }
  }

  const busy = phase !== 'idle';
  return (
    <button
      type="button"
      onClick={handleClaim}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-full bg-[#c9a96e]/15 px-3 py-1 text-xs font-semibold text-[#c9a96e] hover:bg-[#c9a96e]/25 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {phase === 'idle' && 'Claim earnings'}
      {phase === 'building' && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" /> Building…
        </>
      )}
      {phase === 'signing' && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" /> Sign in wallet…
        </>
      )}
      {phase === 'submitting' && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" /> Submitting…
        </>
      )}
      {phase === 'done' && (
        <>
          <Check className="h-3 w-3" /> Claimed
        </>
      )}
    </button>
  );
}
