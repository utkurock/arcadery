'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { GameContext } from '@/components/games/_shared/entry-gate';
import { HexTowerIntro } from './hex-tower-intro';

const HexTower = dynamic(
  () => import('@/components/games/hex-tower/hex-tower').then((m) => m.HexTower),
  { ssr: false, loading: () => <LoadingScreen /> },
);

const ENTRY_STORAGE_KEY = 'hex-tower:entry';

export function HexTowerClient() {
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
    <div className="relative h-screen w-screen bg-[#fde6d0] text-stone-900 overflow-hidden">
      {!ctx && <TopBar />}
      {ctx ? (
        <HexTower gameContext={ctx} onExit={exit} />
      ) : (
        <HexTowerIntro onEntered={enter} />
      )}
    </div>
  );
}

function TopBar() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-4 py-3">
      <Link
        href="/explore"
        className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-white/70 backdrop-blur px-3 py-1.5 text-xs font-mono text-stone-700 hover:bg-white"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back
      </Link>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#fde6d0] text-stone-700 font-mono text-xs uppercase tracking-widest animate-pulse">
      Stacking the spire…
    </div>
  );
}
