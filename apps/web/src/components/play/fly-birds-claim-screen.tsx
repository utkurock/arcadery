'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Loader2, Trophy, RotateCcw, Sparkles, Check, AlertCircle } from 'lucide-react';

interface Props {
  status: 'won' | 'lost';
  finalScore: number;
  poolLamports: number;
  myRank: number | null;
  myBest: number | null;
  topPlayer: { wallet_address: string; score: number } | null;
  isWinner: boolean;
  onPlayAgain: () => void;
  onClaimed: (signature: string, payoutLamports: number) => void;
}

function lamportsToSol(l: number): string {
  return (l / 1e9).toFixed(4);
}

function shortWallet(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

type ClaimPhase = 'idle' | 'claiming' | 'done' | 'error';

export function FlyBirdsClaimScreen({
  status,
  finalScore,
  poolLamports,
  myRank,
  myBest,
  topPlayer,
  isWinner,
  onPlayAgain,
  onClaimed,
}: Props) {
  const { publicKey } = useWallet();
  const [claimPhase, setClaimPhase] = useState<ClaimPhase>('idle');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [payoutSig, setPayoutSig] = useState<string | null>(null);
  const [payoutLamports, setPayoutLamports] = useState<number | null>(null);

  async function handleClaim() {
    if (!publicKey) return;
    setClaimError(null);
    setClaimPhase('claiming');
    try {
      const res = await fetch('/api/games/fly-birds/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey.toBase58() }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        signature?: string;
        payoutLamports?: number;
        error?: string;
        code?: string;
      };
      if (!res.ok || !payload.signature) {
        throw new Error(payload.error || 'Claim failed');
      }
      setPayoutSig(payload.signature);
      setPayoutLamports(payload.payoutLamports ?? poolLamports);
      setClaimPhase('done');
      onClaimed(payload.signature, payload.payoutLamports ?? poolLamports);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Claim failed';
      setClaimError(msg);
      setClaimPhase('error');
    }
  }

  const won = status === 'won';
  const showWinnerCta = isWinner && claimPhase !== 'done';

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 backdrop-blur-md px-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#181928] to-[#0c0d14] shadow-2xl">
        {/* Hero */}
        <div
          className={`relative px-6 py-6 text-center ${
            isWinner
              ? 'bg-gradient-to-br from-yellow-500 via-amber-500 to-orange-500'
              : won
                ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                : 'bg-gradient-to-br from-rose-500/80 to-red-700/80'
          }`}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.3),transparent_60%)]" />
          <div className="relative">
            <h2 className="text-3xl font-black text-white drop-shadow-lg">
              {isWinner ? '🏆 You won the round!' : won ? 'You won!' : 'Game over'}
            </h2>
            <p className="mt-2 text-sm font-semibold text-white/90">
              Final score · <span className="text-2xl font-black tabular-nums">{finalScore}</span>
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Pool + rank cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                Prize pool
              </p>
              <p className="mt-1 text-xl font-black text-yellow-400 tabular-nums">
                {lamportsToSol(payoutLamports ?? poolLamports)}{' '}
                <span className="text-xs font-semibold text-yellow-400/60">SOL</span>
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                Your rank
              </p>
              <p className="mt-1 text-xl font-black text-white tabular-nums">
                {myRank ? `#${myRank}` : '—'}
                {myBest != null && myBest !== finalScore && (
                  <span className="ml-1.5 text-[10px] font-semibold text-white/40">
                    best {myBest}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Winner CTA — claim flow */}
          {showWinnerCta && (
            <div className="space-y-2">
              <button
                onClick={handleClaim}
                disabled={claimPhase === 'claiming'}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 py-3.5 text-sm font-bold text-[#1a0f00] shadow-lg shadow-yellow-500/30 hover:from-yellow-400 hover:to-amber-400 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {claimPhase === 'claiming' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Sending payout…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Claim {lamportsToSol(poolLamports)} SOL
                  </>
                )}
              </button>
              {claimError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{claimError}</span>
                </div>
              )}
            </div>
          )}

          {/* Claim success state */}
          {claimPhase === 'done' && payoutSig && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
              <div className="flex items-center gap-2 text-emerald-300">
                <Check className="h-4 w-4" />
                <p className="text-sm font-bold">
                  {lamportsToSol(payoutLamports ?? poolLamports)} SOL sent to your wallet
                </p>
              </div>
              <a
                href={`https://explorer.solana.com/tx/${payoutSig}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-[10px] font-mono text-emerald-300/70 hover:text-emerald-300 truncate"
              >
                {payoutSig}
              </a>
            </div>
          )}

          {/* Non-winner copy */}
          {!isWinner && topPlayer && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="h-3.5 w-3.5 text-yellow-400" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                    Round leader
                  </p>
                </div>
                <p className="text-sm font-mono text-white/70">
                  {shortWallet(topPlayer.wallet_address)} · {topPlayer.score}
                </p>
              </div>
              <p className="mt-2 text-[11px] text-white/40 leading-relaxed">
                Beat their score to claim the pool — pay another entry and try again.
              </p>
            </div>
          )}

          <button
            onClick={onPlayAgain}
            disabled={claimPhase === 'claiming'}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-2.5 text-sm font-semibold text-white/80 hover:bg-white/[0.08] hover:text-white disabled:opacity-50 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {claimPhase === 'done' ? 'New round — play again' : 'Play again (new entry)'}
          </button>
        </div>
      </div>
    </div>
  );
}
