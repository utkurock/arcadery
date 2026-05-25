'use client';

/**
 * GameIntroScreen — a Roblox-style entry splash shown before any game starts.
 *
 * Config-driven (scene.intro): picks one of four built-in themes and renders a
 * big title, hook, a chunky Play button, and an optional (cosmetic) wallet
 * connect chip. Wallet connect never blocks play — it's there for score-saving
 * / tokenized games. Used by /play/[slug] and the editor test-play.
 */

import type { ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Play, Wallet, Check } from 'lucide-react';
import type { IntroConfig, IntroTheme } from '@arcadery/shared';
import { useModals } from '@/lib/ui/modals';

interface ThemeTokens {
  root: string;
  title: string;
  subtitle: string;
  eyebrow: string;
  playBtn: string;
  chip: string;
  dot: string;
  Backdrop: () => ReactNode;
}

const THEMES: Record<IntroTheme, ThemeTokens> = {
  'arcade-neon': {
    root: 'bg-[#06070f] text-white',
    eyebrow: 'text-cyan-300/70',
    title:
      'bg-gradient-to-br from-cyan-200 via-fuchsia-300 to-indigo-400 bg-clip-text text-transparent drop-shadow-[0_4px_40px_rgba(34,211,238,0.45)]',
    subtitle: 'text-cyan-100/60',
    playBtn:
      'bg-gradient-to-r from-cyan-400 to-fuchsia-500 text-black shadow-[0_8px_40px_-6px_rgba(34,211,238,0.7)] hover:shadow-[0_12px_50px_-4px_rgba(217,70,239,0.7)]',
    chip: 'border-cyan-300/40 bg-cyan-400/10 text-cyan-100',
    dot: 'bg-emerald-400',
    Backdrop: () => (
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(34,211,238,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(217,70,239,0.5) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse at 50% 40%, #000 30%, transparent 75%)',
          }}
        />
        <div className="og-orb absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-cyan-500/30 blur-3xl" />
        <div className="og-orb-2 absolute bottom-0 right-1/4 h-80 w-80 rounded-full bg-fuchsia-600/30 blur-3xl" />
      </div>
    ),
  },
  'sunset-pop': {
    root: 'bg-[#1a0b1f] text-white',
    eyebrow: 'text-amber-200/80',
    title:
      'bg-gradient-to-br from-amber-200 via-orange-400 to-pink-500 bg-clip-text text-transparent drop-shadow-[0_4px_40px_rgba(251,146,60,0.45)]',
    subtitle: 'text-orange-100/70',
    playBtn:
      'bg-gradient-to-r from-amber-400 to-pink-500 text-[#2a0f12] shadow-[0_10px_44px_-6px_rgba(251,146,60,0.7)] hover:shadow-[0_14px_54px_-4px_rgba(236,72,153,0.7)]',
    chip: 'border-amber-300/40 bg-amber-400/10 text-amber-100',
    dot: 'bg-amber-300',
    Backdrop: () => (
      <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-[#2a1030] via-[#3a1530] to-[#1a0b1f]">
        <div className="og-orb absolute -top-20 left-10 h-80 w-80 rounded-full bg-orange-500/40 blur-3xl" />
        <div className="og-orb-2 absolute top-1/3 -right-10 h-96 w-96 rounded-full bg-pink-600/40 blur-3xl" />
        <div className="og-orb absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-amber-400/30 blur-3xl" />
      </div>
    ),
  },
  'pixel-retro': {
    root: 'bg-[#0a0f0a] text-emerald-50',
    eyebrow: 'text-emerald-400/80',
    title:
      'text-emerald-300 drop-shadow-[0_0_18px_rgba(16,185,129,0.6)] [text-shadow:_3px_3px_0_#064e3b]',
    subtitle: 'text-emerald-200/60',
    playBtn:
      'bg-emerald-400 text-[#052e16] shadow-[0_8px_0_#065f46] hover:translate-y-0.5 hover:shadow-[0_4px_0_#065f46] [image-rendering:pixelated]',
    chip: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100',
    dot: 'bg-emerald-400',
    Backdrop: () => (
      <div className="absolute inset-0 overflow-hidden bg-[#0a0f0a]">
        <div
          className="absolute inset-0 opacity-[0.25]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(16,185,129,0.35) 2px, transparent 2px), linear-gradient(90deg, rgba(16,185,129,0.35) 2px, transparent 2px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px)',
          }}
        />
      </div>
    ),
  },
  'clean-mint': {
    root: 'bg-[#f3f7f4] text-[#0f1c17]',
    eyebrow: 'text-emerald-700/70',
    title: 'text-[#0f1c17]',
    subtitle: 'text-[#0f1c17]/55',
    playBtn:
      'bg-[#10b981] text-white shadow-[0_10px_30px_-8px_rgba(16,185,129,0.6)] hover:shadow-[0_14px_38px_-6px_rgba(16,185,129,0.7)]',
    chip: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-800',
    dot: 'bg-emerald-500',
    Backdrop: () => (
      <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-white to-[#e6f0ea]">
        <div className="og-orb absolute -top-16 right-1/4 h-72 w-72 rounded-full bg-emerald-300/40 blur-3xl" />
        <div className="og-orb-2 absolute -bottom-20 left-1/4 h-80 w-80 rounded-full bg-teal-200/50 blur-3xl" />
      </div>
    ),
  },
};

function truncate(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

interface Props {
  intro?: IntroConfig | null;
  gameName: string;
  creatorName?: string;
  onPlay: () => void;
  /** Hide the wallet chip entirely (e.g. editor preview). Default: shown. */
  showWallet?: boolean;
}

export function GameIntroScreen({ intro, gameName, creatorName, onPlay, showWallet = true }: Props) {
  const theme = THEMES[(intro?.theme as IntroTheme) ?? 'arcade-neon'] ?? THEMES['arcade-neon'];
  const title = (intro?.title || gameName || 'Untitled Game').toUpperCase();
  const subtitle = intro?.subtitle || '';
  const ctaLabel = intro?.ctaLabel || 'Play';

  const { connected, publicKey } = useWallet();
  const openLogin = useModals((s) => s.openLogin);
  const addr = publicKey?.toBase58();

  return (
    <div className={`absolute inset-0 z-40 flex flex-col ${theme.root}`}>
      <style>{`
        @keyframes ogOrb { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(20px,-24px) scale(1.12); } }
        @keyframes ogOrb2 { 0%,100% { transform: translate(0,0) scale(1.05); } 50% { transform: translate(-26px,18px) scale(0.92); } }
        .og-orb { animation: ogOrb 9s ease-in-out infinite; }
        .og-orb-2 { animation: ogOrb2 11s ease-in-out infinite; }
        @keyframes ogRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .og-rise { animation: ogRise 0.5s ease-out both; }
        @keyframes ogPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
        .og-cta { animation: ogPulse 2.4s ease-in-out infinite; }
      `}</style>

      {intro?.backgroundImageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={intro.backgroundImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/45" />
        </>
      ) : (
        <theme.Backdrop />
      )}

      {/* Wallet chip — cosmetic, never blocks play */}
      {showWallet && (
        <div className="absolute top-4 right-4 z-10">
          {connected && addr ? (
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-mono backdrop-blur ${theme.chip}`}
            >
              <span className={`h-2 w-2 rounded-full ${theme.dot}`} />
              {truncate(addr)}
            </div>
          ) : (
            <button
              onClick={openLogin}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold backdrop-blur transition-transform hover:scale-105 ${theme.chip}`}
            >
              <Wallet className="h-3.5 w-3.5" />
              Connect Wallet
            </button>
          )}
        </div>
      )}

      {/* Center stack */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className={`og-rise mb-3 font-mono text-[11px] uppercase tracking-[0.5em] ${theme.eyebrow}`}>
          {creatorName ? `by ${creatorName}` : 'Arcadery'}
        </p>
        <h1
          className={`og-rise mb-4 max-w-3xl text-5xl font-black leading-[0.9] tracking-tight sm:text-7xl ${theme.title}`}
          style={{ animationDelay: '0.05s' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className={`og-rise mb-10 max-w-md text-sm leading-relaxed ${theme.subtitle}`}
            style={{ animationDelay: '0.1s' }}
          >
            {subtitle}
          </p>
        )}

        <button
          onClick={onPlay}
          className={`og-cta og-rise group inline-flex items-center gap-3 rounded-2xl px-12 py-5 text-2xl font-black tracking-tight transition-transform hover:scale-105 active:scale-95 ${theme.playBtn}`}
          style={{ animationDelay: '0.15s' }}
        >
          <Play className="h-7 w-7 fill-current" />
          {ctaLabel}
        </button>

        <p
          className={`og-rise mt-5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest opacity-50`}
          style={{ animationDelay: '0.2s' }}
        >
          {connected ? (
            <>
              <Check className="h-3 w-3" /> Wallet connected · scores saved
            </>
          ) : (
            <>WASD / arrows to move</>
          )}
        </p>
      </div>
    </div>
  );
}
