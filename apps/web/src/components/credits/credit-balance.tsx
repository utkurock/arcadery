'use client';

import { Coins, Plus } from 'lucide-react';
import { useCredits } from '@/lib/credits/context';

export function CreditBalance({ compact = false }: { compact?: boolean }) {
  const { balance, loading, signedIn, openBuyModal } = useCredits();

  if (loading || !signedIn) return null;

  const display = balance ?? 0;

  if (compact) {
    return (
      <button
        type="button"
        onClick={openBuyModal}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[12px] font-medium text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
        title={`${display} credits — click to buy more`}
      >
        <Coins className="h-3.5 w-3.5 text-[#8b7ec8]" />
        <span className="font-mono tabular-nums">{display}</span>
        <Plus className="h-3 w-3 opacity-60" />
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-[#8b7ec8]" />
        <span className="text-sm font-medium text-white">
          <span className="font-mono tabular-nums">{display}</span>
          <span className="ml-1 text-white/40 text-xs">credits</span>
        </span>
      </div>
      <button
        type="button"
        onClick={openBuyModal}
        className="rounded-full bg-[#8b7ec8] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#7a6db8]"
      >
        Buy
      </button>
    </div>
  );
}
