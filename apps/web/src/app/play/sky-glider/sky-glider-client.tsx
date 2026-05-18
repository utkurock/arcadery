'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { GameContext } from '@/components/games/_shared/entry-gate';
import { SkyGliderIntro } from './sky-glider-intro';

const SkyGlider = dynamic(
  () => import('@/components/games/sky-glider/sky-glider').then((m) => m.SkyGlider),
  { ssr: false, loading: () => <LoadingScreen /> },
);

const ENTRY_STORAGE_KEY = 'sky-glider:entry';

export function SkyGliderClient() {
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
    <div className="relative h-screen w-screen bg-[#05070f] text-white overflow-hidden">
      {!ctx && <TopBar />}
      {ctx ? (
        <SkyGlider gameContext={ctx} onExit={exit} />
      ) : (
        <SkyGliderIntro onEntered={enter} />
      )}
    </div>
  );
}

function TopBar() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-4 py-3">
      <Link
        href="/explore"
        className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur px-3 py-1.5 text-xs font-mono text-white/80 hover:bg-black/60"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back
      </Link>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#05070f] text-cyan-200 font-mono text-xs uppercase tracking-widest animate-pulse">
      Booting up the canyon…
    </div>
  );
}
