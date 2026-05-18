'use client';

import { Check, Wallet } from 'lucide-react';
import { useModals } from '@/lib/ui/modals';
import { shortenWallet } from './use-pay-to-play';

// Compact wallet status pill. Shown in the top corner of every game's intro
// screen so the "are you signed in?" answer is one glance away without
// dominating the splash like the old EntryGate did. Themable via `tone` so
// each intro can match its game palette.

interface Props {
  connected: boolean;
  walletAddress: string | null;
  /** Color the chip uses for the connected state. Each game passes its accent. */
  tone?: {
    /** tailwind classes for the chip background + ring */
    chip: string;
    /** tailwind class for the success dot */
    dot: string;
  };
  /** Show "Devnet" tag inside the chip (set false for production builds). */
  showNetwork?: boolean;
}

const DEFAULT_TONE = {
  chip: 'border-cyan-300/30 bg-cyan-400/10 text-cyan-100',
  dot: 'bg-emerald-400 shadow-emerald-400/60',
};

export function WalletChip({
  connected,
  walletAddress,
  tone = DEFAULT_TONE,
  showNetwork = true,
}: Props) {
  if (connected && walletAddress) {
    return (
      <div
        className={`pointer-events-auto inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-mono backdrop-blur ${tone.chip}`}
      >
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${tone.dot} shadow-[0_0_8px_2px]`}
        />
        <Check className="h-3 w-3 opacity-70" />
        <span className="tabular-nums opacity-90">
          {shortenWallet(walletAddress)}
        </span>
        {showNetwork && (
          <span className="ml-1 rounded-full bg-white/10 px-1.5 py-px text-[9px] uppercase tracking-widest opacity-60">
            devnet
          </span>
        )}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => useModals.getState().openLogin()}
      className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[11px] font-mono text-white/80 backdrop-blur hover:bg-white/10"
    >
      <Wallet className="h-3 w-3" />
      Connect wallet
    </button>
  );
}
