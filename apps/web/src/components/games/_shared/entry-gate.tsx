'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Wallet, Zap } from 'lucide-react';
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionExpiredBlockheightExceededError,
} from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useModals } from '@/lib/ui/modals';
import {
  BUILTIN_ENTRY_FEE_LAMPORTS,
  BUILTIN_ENTRY_FEE_SOL,
  publicTreasuryAddress,
  type BuiltinGameKey,
} from '@/lib/builtin-games/config';

// Shared "pay 0.01 SOL to play" splash. Mirrors drift-racer/drift-racer-client
// EntryGate so wallet UX is consistent across every built-in game. Uses the
// platform's global login modal (useModals) since wallet-adapter-react-ui
// isn't installed in apps/web — login flow opens SIWS modal which connects
// the wallet via the existing adapter providers.

export interface GameContext {
  wallet: string;
  entrySignature: string | null;
}

type Phase = 'idle' | 'building' | 'signing' | 'confirming' | 'verifying' | 'error';

interface Props {
  gameKey: BuiltinGameKey;
  title: string;
  subtitle?: string;
  rewardText: string;
  // tailwind classes for the header gradient — gives each game its own vibe
  headerGradient: string;
  ctaGradient: string;
  ctaShadow: string;
  onEntered: (ctx: GameContext) => void;
}

export function EntryGate({
  gameKey,
  title,
  subtitle,
  rewardText,
  headerGradient,
  ctaGradient,
  ctaShadow,
  onEntered,
}: Props) {
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

  // Dev/bypass: no treasury configured → drop the player straight in once
  // their wallet is connected. The /api/games/.../entry route mirrors this.
  useEffect(() => {
    if (!treasury && connected && publicKey) {
      onEntered({ wallet: publicKey.toBase58(), entrySignature: null });
    }
  }, [treasury, connected, publicKey, onEntered]);

  const isBusy =
    phase === 'building' ||
    phase === 'signing' ||
    phase === 'confirming' ||
    phase === 'verifying';

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
          lamports: BUILTIN_ENTRY_FEE_LAMPORTS,
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
      const res = await fetch(`/api/games/${gameKey}/entry`, {
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
    idle: connected ? `Pay ${BUILTIN_ENTRY_FEE_SOL} SOL & play` : 'Connect wallet to play',
    building: 'Preparing transaction…',
    signing: 'Approve in wallet…',
    confirming: 'Confirming on Solana…',
    verifying: 'Joining the game…',
    error: 'Try again',
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-gradient-to-br from-[#0b1220]/85 via-[#10243d]/90 to-[#1f0f3a]/85 backdrop-blur-md px-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#181928] to-[#0f1018] shadow-2xl">
        <div className={`relative ${headerGradient} px-6 py-5`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
          <div className="relative">
            {subtitle && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                {subtitle}
              </p>
            )}
            <p className="text-2xl font-black text-white tabular-nums">{title}</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-white/60 leading-relaxed">
            Pay <span className="font-mono text-white">{BUILTIN_ENTRY_FEE_SOL} SOL</span> on
            devnet to enter. {rewardText}
          </p>

          <button
            onClick={handlePay}
            disabled={isBusy}
            className={`flex w-full items-center justify-center gap-2 rounded-xl ${ctaGradient} py-3.5 text-sm font-bold text-white shadow-lg ${ctaShadow} hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-all`}
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
