'use client';

import { useState } from 'react';
import { Connection, Transaction } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { X, Loader2, Check, AlertCircle, Coins, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { defaultRpcUrlForCluster } from '@/lib/credits/config';

interface ClaimResponse {
  serializedTx: string;
  pool: string;
  blockhash: string;
  lastValidBlockHeight: number;
  error?: string;
  code?: string;
}

type Phase = 'idle' | 'building' | 'signing' | 'submitting' | 'confirming' | 'done' | 'error';

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Claim trading fees',
  building: 'Preparing claim…',
  signing: 'Approve in wallet…',
  submitting: 'Submitting…',
  confirming: 'Confirming…',
  done: 'Claimed',
  error: 'Try again',
};

/**
 * In-app creator trading-fee claim. Calls POST /api/tokens/claim (which builds
 * a partial-signed `claimCreatorTradingFee` tx), the owner's wallet signs, we
 * submit and confirm. SOL fees land directly in the creator's wallet.
 *
 * Replaces the old "Manage on Meteora" deeplink as the primary claim action;
 * the Meteora link stays available for charts / graduation.
 */
export function ClaimFeesModal({
  gameId,
  gameName,
  tokenSymbol,
  meteoraUrl,
  onClose,
}: {
  gameId: string;
  gameName: string;
  tokenSymbol: string | null;
  meteoraUrl: string | null;
  onClose: () => void;
}) {
  const { publicKey, signTransaction, connected } = useWallet();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  const busy =
    phase === 'building' || phase === 'signing' || phase === 'submitting' || phase === 'confirming';
  const canClaim = connected && !!publicKey && !!signTransaction && !busy;

  async function handleClaim() {
    if (!publicKey || !signTransaction) return;
    setError(null);
    setTxSig(null);
    setPhase('building');
    try {
      const res = await fetch('/api/tokens/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameId }),
      });
      const data = (await res.json().catch(() => ({}))) as ClaimResponse;
      if (!res.ok) {
        throw new Error(data.error ?? `Claim build failed (${res.status})`);
      }

      const txBytes = Uint8Array.from(Buffer.from(data.serializedTx, 'base64'));
      const tx = Transaction.from(txBytes);

      setPhase('signing');
      const signed = await signTransaction(tx);

      setPhase('submitting');
      const rpcUrl =
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
        defaultRpcUrlForCluster(process.env.NEXT_PUBLIC_SOLANA_CLUSTER);
      const conn = new Connection(rpcUrl, 'confirmed');
      const sig = await conn.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      setPhase('confirming');
      const confirmation = await conn.confirmTransaction(
        {
          signature: sig,
          blockhash: data.blockhash,
          lastValidBlockHeight: data.lastValidBlockHeight,
        },
        'confirmed',
      );
      if (confirmation.value.err) {
        throw new Error(`On-chain failure: ${JSON.stringify(confirmation.value.err)}`);
      }

      setTxSig(sig);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Claim failed');
      setPhase('error');
    }
  }

  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet' ? 'devnet' : 'mainnet';
  const explorerUrl = txSig
    ? `https://solscan.io/tx/${txSig}${cluster === 'devnet' ? '?cluster=devnet' : ''}`
    : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#15131c] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#c9a96e]/15">
              <Coins className="h-4 w-4 text-[#c9a96e]" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">
                Claim fees{tokenSymbol ? ` · $${tokenSymbol}` : ''}
              </h2>
              <p className="text-[11px] text-white/40 truncate">{gameName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {phase === 'done' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              <Check className="h-4 w-4 shrink-0" />
              <span>Trading fees claimed to your wallet.</span>
            </div>
            {explorerUrl && (
              <Link
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#c9a96e] hover:underline"
              >
                View transaction <ExternalLink className="h-3 w-3" />
              </Link>
            )}
            <button
              onClick={onClose}
              className="w-full rounded-xl bg-white/[0.06] py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-white/50">
              Your share of trading fees (70%) accrues on the bonding curve in SOL. Claiming
              builds a transaction your connected wallet signs — fees land directly in your wallet.
            </p>

            {!connected && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Connect your creator wallet to claim.
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="break-words">{error}</span>
              </div>
            )}

            <button
              onClick={handleClaim}
              disabled={!canClaim}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#c9a96e] py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#d8bc85] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {PHASE_LABEL[phase]}
            </button>

            {meteoraUrl && (
              <Link
                href={meteoraUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 text-[11px] text-white/40 hover:text-white/70"
              >
                View charts & graduation on Meteora <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
