'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  Loader2,
  Trophy,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionExpiredBlockheightExceededError,
} from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useModals } from '@/lib/ui/modals';
import {
  DRIFT_ENTRY_FEE_LAMPORTS,
  DRIFT_ENTRY_FEE_SOL,
  publicTreasuryAddress,
} from '@/lib/drift-racer/config';

const DriftRacer = dynamic(
  () => import('@/components/games/drift-racer/drift-racer').then((m) => m.DriftRacer),
  { ssr: false, loading: () => <LoadingScreen /> },
);

export interface DriftRaceContext {
  wallet: string;
  entrySignature: string | null;
}

const ENTRY_STORAGE_KEY = 'drift-racer:entry';

export function DriftRacerClient() {
  const [ctx, setCtx] = useState<DriftRaceContext | null>(null);

  // Restore the entry from sessionStorage on mount so a page refresh after
  // payment doesn't re-prompt for SOL.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ENTRY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DriftRaceContext;
      if (parsed?.wallet) setCtx(parsed);
    } catch {}
  }, []);

  const enter = (next: DriftRaceContext) => {
    try {
      sessionStorage.setItem(ENTRY_STORAGE_KEY, JSON.stringify(next));
    } catch {}
    setCtx(next);
  };

  const exit = () => {
    try {
      sessionStorage.removeItem(ENTRY_STORAGE_KEY);
    } catch {}
    setCtx(null);
  };

  return (
    <div className="relative h-screen w-screen bg-[#06090f] text-white overflow-hidden">
      <TopBar />
      {ctx ? (
        <DriftRacer raceContext={ctx} onExit={exit} />
      ) : (
        <EntryGate onEntered={enter} />
      )}
    </div>
  );
}

function TopBar() {
  return (
    <div className="pointer-events-none absolute top-0 left-0 right-0 z-30 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 py-3 sm:px-4">
      <div className="pointer-events-auto flex items-center gap-2">
        <Link
          href="/explore"
          className="flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-medium hover:bg-white/20"
          aria-label="Back to Explore"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Explore</span>
        </Link>
        <span className="text-sm font-bold">Drift Racer</span>
        <span className="hidden text-sm text-white/40 sm:inline">by Arcadery</span>
      </div>
    </div>
  );
}

type Phase = 'idle' | 'building' | 'signing' | 'confirming' | 'verifying' | 'error';

function EntryGate({ onEntered }: { onEntered: (ctx: DriftRaceContext) => void }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const treasury = useMemo(() => {
    const raw = publicTreasuryAddress();
    if (!raw) return null;
    try {
      return new PublicKey(raw);
    } catch {
      return null;
    }
  }, []);

  // Dev/bypass: no treasury configured → just drop the player into the game
  // once their wallet is connected. The server route mirrors this.
  useEffect(() => {
    if (!treasury && connected && publicKey) {
      onEntered({ wallet: publicKey.toBase58(), entrySignature: null });
    }
  }, [treasury, connected, publicKey, onEntered]);

  const isBusy =
    phase === 'building' || phase === 'signing' || phase === 'confirming' || phase === 'verifying';

  const handlePay = async () => {
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
          lamports: DRIFT_ENTRY_FEE_LAMPORTS,
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
      const res = await fetch('/api/games/drift-racer/entry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signature, wallet: publicKey.toBase58() }),
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || 'Server rejected entry');
      }

      onEntered({ wallet: publicKey.toBase58(), entrySignature: signature });
    } catch (err) {
      if (err instanceof TransactionExpiredBlockheightExceededError) {
        setError('Transaction expired — please try again.');
      } else {
        const m = err instanceof Error ? err.message : 'Entry failed';
        setError(m.length > 200 ? m.slice(0, 200) + '…' : m);
      }
      setPhase('error');
    }
  };

  const phaseLabel: Record<Phase, string> = {
    idle: connected ? `Pay ${DRIFT_ENTRY_FEE_SOL} SOL & race` : 'Connect wallet to race',
    building: 'Preparing transaction…',
    signing: 'Approve in wallet…',
    confirming: 'Confirming on Solana…',
    verifying: 'Joining the grid…',
    error: 'Try again',
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-gradient-to-br from-[#0b1220]/85 via-[#10243d]/90 to-[#1f0f3a]/85 backdrop-blur-md px-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#181928] to-[#0f1018] shadow-2xl">
        <div className="relative bg-gradient-to-br from-[#e11d48] via-[#8b7ec8] to-[#4a9bd4] px-6 py-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
              <Trophy className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                Race the AI · 3 laps
              </p>
              <p className="text-2xl font-black text-white tabular-nums">DRIFT RACER</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-white/60 leading-relaxed">
            Pay <span className="font-mono text-white">{DRIFT_ENTRY_FEE_SOL} SOL</span> on devnet
            to enter. Beat the AI to grab the win bonus, lap fast to climb the leaderboard, and
            claim DRIFT tokens at the finish.
          </p>

          <button
            onClick={handlePay}
            disabled={isBusy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#e11d48] to-[#c2185b] py-3.5 text-sm font-bold text-white shadow-lg shadow-[#e11d48]/20 hover:from-[#c2185b] hover:to-[#a30f4a] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            {!isBusy && (connected ? <Zap className="h-4 w-4" /> : <Wallet className="h-4 w-4" />)}
            {phaseLabel[phase]}
          </button>

          {connected && publicKey && (
            <p className="text-center text-[10px] text-white/30 font-mono">
              From {short(publicKey.toBase58())} · Devnet
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-center text-[10px] text-white/30 leading-relaxed">
            Solana devnet · entry is non-refundable
          </p>
        </div>
      </div>
    </div>
  );
}

function short(pk: string): string {
  return pk.length > 8 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
}

function LoadingScreen() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-white/60 font-mono text-xs">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
        Loading circuit…
      </div>
    </div>
  );
}
