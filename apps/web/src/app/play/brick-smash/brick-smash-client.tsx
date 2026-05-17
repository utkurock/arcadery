'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { EntryGate, type GameContext } from '@/components/games/_shared/entry-gate';

const BrickSmash = dynamic(
  () => import('@/components/games/brick-smash/brick-smash').then((m) => m.BrickSmash),
  { ssr: false, loading: () => <LoadingScreen /> },
);

const ENTRY_STORAGE_KEY = 'brick-smash:entry';

export function BrickSmashClient() {
  const [ctx, setCtx] = useState<GameContext | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ENTRY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as GameContext;
      if (parsed?.wallet) setCtx(parsed);
    } catch {}
  }, []);

  const enter = (next: GameContext) => {
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
    <div className="relative h-screen w-screen bg-[#07101c] text-white overflow-hidden">
      <TopBar />
      {ctx ? (
        <BrickSmash gameContext={ctx} onExit={exit} />
      ) : (
        <EntryGate
          gameKey="brick-smash"
          title="BRICK SMASH"
          subtitle="3D breakout · 6 levels"
          rewardText="Clear every brick across 6 levels for the top score."
          headerGradient="bg-gradient-to-br from-[#22d3ee] via-[#3b82f6] to-[#a855f7]"
          ctaGradient="bg-gradient-to-r from-[#0ea5e9] to-[#3b82f6]"
          ctaShadow="shadow-[#0ea5e9]/20"
          onEntered={enter}
        />
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
        <span className="text-sm font-bold">Brick Smash</span>
        <span className="hidden text-sm text-white/40 sm:inline">by Arcadery</span>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-white/60 font-mono text-xs">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
        Loading bricks…
      </div>
    </div>
  );
}
