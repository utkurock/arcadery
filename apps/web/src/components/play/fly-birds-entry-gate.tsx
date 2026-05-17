'use client';

import { useState, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionExpiredBlockheightExceededError,
} from '@solana/web3.js';
import { Loader2, Zap, Trophy, Wallet, AlertCircle } from 'lucide-react';
import { useModals } from '@/lib/ui/modals';

const ENTRY_LAMPORTS = 1_000_000; // 0.001 SOL
const ENTRY_SOL = 0.001;

type Phase = 'idle' | 'building' | 'signing' | 'confirming' | 'verifying' | 'error';

interface Props {
  poolLamports: number;
  topPlayer: { wallet_address: string; score: number } | null;
  onEntered: () => void;
}

function lamportsToSol(l: number): string {
  return (l / 1e9).toFixed(4);
}

function shortWallet(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function FlyBirdsEntryGate({ poolLamports, topPlayer, onEntered }: Props) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const treasuryRaw = process.env.NEXT_PUBLIC_TREASURY_WALLET;
  const treasury = useMemo(() => {
    if (!treasuryRaw || treasuryRaw === '11111111111111111111111111111111') return null;
    try {
      return new PublicKey(treasuryRaw);
    } catch {
      return null;
    }
  }, [treasuryRaw]);

  const isBusy =
    phase === 'building' || phase === 'signing' || phase === 'confirming' || phase === 'verifying';

  async function handlePay() {
    if (!connected || !publicKey || !sendTransaction) {
      useModals.getState().openLogin();
      return;
    }
    if (!treasury) {
      setError('Treasury wallet not configured');
      setPhase('error');
      return;
    }

    setError(null);
    setPhase('building');
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({
        feePayer: publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: treasury,
          lamports: ENTRY_LAMPORTS,
        }),
      );

      setPhase('signing');
      const signature = await sendTransaction(tx, connection);

      setPhase('confirming');
      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      );
      if (confirmation.value.err) {
        throw new Error(`On-chain failure: ${JSON.stringify(confirmation.value.err)}`);
      }

      setPhase('verifying');
      const res = await fetch('/api/games/fly-birds/enter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signature, wallet: publicKey.toBase58() }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Server rejected entry');
      }

      // Persist entry for this round so a refresh doesn't re-prompt the user
      // for payment when they're already in.
      try {
        sessionStorage.setItem('flybirds_entered', signature);
      } catch {}
      onEntered();
    } catch (err) {
      if (err instanceof TransactionExpiredBlockheightExceededError) {
        setError('Transaction expired — please try again.');
      } else {
        const m = err instanceof Error ? err.message : 'Entry failed';
        setError(m.length > 200 ? m.slice(0, 200) + '…' : m);
      }
      setPhase('error');
    }
  }

  const phaseLabel: Record<Phase, string> = {
    idle: connected ? `Pay ${ENTRY_SOL} SOL & play` : 'Connect wallet to play',
    building: 'Preparing transaction…',
    signing: 'Approve in wallet…',
    confirming: 'Confirming on Solana…',
    verifying: 'Joining the round…',
    error: 'Try again',
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-gradient-to-br from-[#0b1220]/85 via-[#10243d]/90 to-[#1f0f3a]/85 backdrop-blur-md px-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#181928] to-[#0f1018] shadow-2xl">
        {/* Hero band */}
        <div className="relative bg-gradient-to-br from-[#5db8a8] via-[#4a9bd4] to-[#8b7ec8] px-6 py-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
              <Trophy className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                Prize pool
              </p>
              <p className="text-2xl font-black text-white tabular-nums">
                {lamportsToSol(poolLamports)} <span className="text-base font-bold text-white/80">SOL</span>
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-white">Fly Birds — pay to play</h2>
            <p className="mt-1 text-sm text-white/60 leading-relaxed">
              Drop <span className="font-mono text-white">{ENTRY_SOL} SOL</span> into the round to
              enter. The top scorer when you finish can claim the entire pool.
            </p>
          </div>

          {topPlayer && (
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-yellow-500/15 text-yellow-400">
                  <Trophy className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    Score to beat
                  </p>
                  <p className="text-xs font-mono text-white/80">{shortWallet(topPlayer.wallet_address)}</p>
                </div>
              </div>
              <p className="text-xl font-black text-yellow-400 tabular-nums">{topPlayer.score}</p>
            </div>
          )}

          <button
            onClick={handlePay}
            disabled={isBusy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5db8a8] to-[#4ca597] py-3.5 text-sm font-bold text-white shadow-lg shadow-[#5db8a8]/20 hover:from-[#4ca597] hover:to-[#3d9285] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            {!isBusy && (connected ? <Zap className="h-4 w-4" /> : <Wallet className="h-4 w-4" />)}
            {phaseLabel[phase]}
          </button>

          {connected && publicKey && (
            <p className="text-center text-[10px] text-white/30 font-mono">
              From {shortWallet(publicKey.toBase58())} · Devnet
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-center text-[10px] text-white/30 leading-relaxed">
            Solana devnet · entry is non-refundable · pool grows with every player
          </p>
        </div>
      </div>
    </div>
  );
}
