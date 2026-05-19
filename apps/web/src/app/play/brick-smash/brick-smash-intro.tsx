'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Crosshair } from 'lucide-react';
import {
  usePayToPlay,
  type PayToPlayContext,
} from '@/components/games/_shared/use-pay-to-play';
import { WalletChip } from '@/components/games/_shared/wallet-chip';

// Brick Smash intro — stacks of glowing bricks behind a bouncing ball arc.
// Static SVG bricks + a CSS-animated ball that bounces left↔right across
// the screen.

interface Props {
  onEntered: (ctx: PayToPlayContext) => void;
}

export function BrickSmashIntro({ onEntered }: Props) {
  const ctl = usePayToPlay({ gameKey: 'brick-smash', onEntered });
  const [bestScore, setBestScore] = useState(0);
  useEffect(() => {
    try {
      setBestScore(Number(localStorage.getItem('arcadery:brick-smash:hs') ?? 0));
    } catch {}
  }, []);

  const cta = ctaLabel(ctl.phase, ctl.connected);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <BrickBackdrop />

      <div className="absolute top-3 right-3 z-20">
        <WalletChip
          connected={ctl.connected}
          walletAddress={ctl.walletAddress}
          tone={{
            chip: 'border-cyan-300/40 bg-cyan-400/10 text-cyan-100',
            dot: 'bg-emerald-400',
          }}
        />
      </div>

      <div className="pointer-events-none absolute top-3 left-3 z-20 font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">
        Paddle armed
      </div>

      <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
        <div className="w-full max-w-xl text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-cyan-300/80 mb-3">
            3D breakout · 6 levels
          </p>
          <h1 className="font-black tracking-tight text-6xl sm:text-7xl leading-[0.85] mb-3 text-white">
            <span
              className="bg-gradient-to-br from-cyan-200 via-sky-300 to-blue-400 bg-clip-text text-transparent"
              style={{
                filter:
                  'drop-shadow(0 0 24px rgba(34, 211, 238, 0.45))',
              }}
            >
              BRICK
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
              SMASH
            </span>
          </h1>
          <p className="font-mono text-sm text-white/65 leading-relaxed mb-8 max-w-md mx-auto">
            Bounce a glowing ball through six layers of bricks. Catch power-ups,
            spawn multi-balls, clear the floor — and the leaderboard.
          </p>

          <CTA
            label={cta.label}
            spinning={ctl.isBusy}
            disabled={ctl.isBusy}
            onClick={ctl.enter}
          />

          <div className="mt-3 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-widest text-white/40">
            <span>Entry · {ctl.feeSol} SOL</span>
            <span className="opacity-40">•</span>
            <span>Devnet</span>
            {bestScore > 0 && (
              <>
                <span className="opacity-40">•</span>
                <span>Best · {bestScore.toLocaleString()}</span>
              </>
            )}
          </div>

          {ctl.error && (
            <div className="mt-4 mx-auto max-w-md flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 font-mono">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span className="text-left">{ctl.error}</span>
              <button
                onClick={ctl.clearError}
                className="ml-auto text-red-200/70 hover:text-red-100"
              >
                dismiss
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-4 z-10 pointer-events-none flex items-center justify-center gap-6 font-mono text-[10px] uppercase tracking-[0.4em] text-white/30">
        <span>A · D paddle</span>
        <span className="opacity-40">·</span>
        <span>Space launch</span>
      </div>
    </div>
  );
}

function CTA({
  label,
  spinning,
  disabled,
  onClick,
}: {
  label: string;
  spinning: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group relative inline-flex items-center gap-3 rounded-full px-9 py-4 font-mono text-sm uppercase tracking-[0.3em] font-bold text-black transition-transform active:scale-[0.97] disabled:opacity-70 disabled:cursor-not-allowed"
      style={{
        background:
          'linear-gradient(135deg, #67e8f9 0%, #60a5fa 50%, #a78bfa 100%)',
        boxShadow:
          '0 0 0 1px rgba(255,255,255,0.25) inset, 0 8px 30px -8px rgba(103,232,249,0.5), 0 16px 60px -10px rgba(96,165,250,0.5)',
      }}
    >
      <span className="absolute inset-0 rounded-full bg-white/0 group-hover:bg-white/10 transition-colors" />
      {spinning ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Crosshair className="h-4 w-4" />
      )}
      <span className="relative">{label}</span>
    </button>
  );
}

function BrickBackdrop() {
  return (
    <div className="absolute inset-0">
      {/* Base gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 70%, #1e2f55 0%, #0a1224 50%, #050912 100%)',
        }}
      />
      {/* Brick rows */}
      <BrickRows />
      {/* Bouncing ball */}
      <BouncingBall />
      {/* Paddle silhouette at bottom */}
      <div
        className="absolute left-1/2 bottom-[14%] -translate-x-1/2 h-3 w-56 rounded-full"
        style={{
          background:
            'linear-gradient(180deg, #67e8f9, #0ea5e9)',
          boxShadow:
            '0 0 18px 4px rgba(14, 165, 233, 0.55), inset 0 1px 0 rgba(255,255,255,0.4)',
        }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%)',
        }}
      />
    </div>
  );
}

function BrickRows() {
  // Six rows × ~12 bricks each, with each row a different gradient/hue.
  // Rows fade upward and slightly tilt away to suggest depth without doing a
  // real perspective transform.
  const palette = [
    'linear-gradient(180deg, #f43f5e, #be123c)',
    'linear-gradient(180deg, #f97316, #c2410c)',
    'linear-gradient(180deg, #fde047, #ca8a04)',
    'linear-gradient(180deg, #22d3ee, #0e7490)',
    'linear-gradient(180deg, #818cf8, #4338ca)',
    'linear-gradient(180deg, #f472b6, #be185d)',
  ];
  return (
    <div className="absolute inset-x-0 top-[8%] flex flex-col gap-[10px] items-center px-4">
      {palette.map((bg, rowIdx) => (
        <div
          key={rowIdx}
          className="flex gap-[8px]"
          style={{
            opacity: 0.45 + rowIdx * 0.08,
            transform: `translateY(${rowIdx * -2}px) scale(${1 - rowIdx * 0.018})`,
          }}
        >
          {Array.from({ length: 14 }).map((_, c) => (
            <div
              key={c}
              className="h-7 w-16 rounded-md"
              style={{
                background: bg,
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.45), 0 6px 14px -4px rgba(0,0,0,0.45)',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function BouncingBall() {
  // Ball arcs across the screen with a synced horizontal + vertical
  // animation that creates a parabolic feel without scripting.
  return (
    <>
      <style jsx>{`
        @keyframes ball-x {
          0% { left: 12%; }
          50% { left: 84%; }
          100% { left: 12%; }
        }
        @keyframes ball-y {
          0%, 100% { top: 58%; }
          25% { top: 50%; }
          50% { top: 64%; }
          75% { top: 52%; }
        }
        .bs-ball {
          position: absolute;
          width: 22px;
          height: 22px;
          margin-left: -11px;
          margin-top: -11px;
          border-radius: 9999px;
          background: radial-gradient(circle at 35% 30%, #fef3c7, #facc15 60%, #ca8a04);
          box-shadow: 0 0 22px 6px rgba(250, 204, 21, 0.55);
          animation: ball-x 4s ease-in-out infinite, ball-y 1.6s ease-in-out infinite;
        }
        .bs-ball::after {
          content: '';
          position: absolute;
          inset: -6px;
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(250,204,21,0.4), transparent 70%);
          z-index: -1;
        }
      `}</style>
      <div className="bs-ball pointer-events-none" />
    </>
  );
}

function ctaLabel(
  phase: ReturnType<typeof usePayToPlay>['phase'],
  connected: boolean,
): { label: string } {
  if (phase === 'building') return { label: 'Preparing…' };
  if (phase === 'signing') return { label: 'Approve in wallet' };
  if (phase === 'confirming') return { label: 'Confirming…' };
  if (phase === 'verifying') return { label: 'Joining…' };
  if (phase === 'error') return { label: 'Try again' };
  if (!connected) return { label: 'Connect to play' };
  return { label: 'Shatter the wall' };
}
