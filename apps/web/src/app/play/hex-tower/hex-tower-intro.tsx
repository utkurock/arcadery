'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, ArrowUp, Loader2 } from 'lucide-react';
import {
  usePayToPlay,
  type PayToPlayContext,
} from '@/components/games/_shared/use-pay-to-play';
import { WalletChip } from '@/components/games/_shared/wallet-chip';

// Hex Tower intro — pastel-sunset palette with floating hexes evoking the
// climbable platform tower. Pure SVG/CSS background, no Three.js boot.

interface Props {
  onEntered: (ctx: PayToPlayContext) => void;
}

export function HexTowerIntro({ onEntered }: Props) {
  const ctl = usePayToPlay({ gameKey: 'hex-tower', onEntered });
  const [bestM, setBestM] = useState(0);
  useEffect(() => {
    try {
      setBestM(Number(localStorage.getItem('arcadery:hex-tower:best') ?? 0));
    } catch {}
  }, []);

  const cta = ctaLabel(ctl.phase, ctl.connected);

  return (
    <div className="relative h-full w-full overflow-hidden text-stone-900">
      <PastelBackdrop />

      <div className="absolute top-3 right-3 z-20">
        <WalletChip
          connected={ctl.connected}
          walletAddress={ctl.walletAddress}
          tone={{
            chip: 'border-rose-400/40 bg-rose-100/70 text-rose-900',
            dot: 'bg-emerald-500',
          }}
        />
      </div>

      <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
        <div className="w-full max-w-xl text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-rose-700/80 mb-3">
            Pastel isometric · vertical
          </p>
          <h1 className="font-black tracking-tight text-6xl sm:text-7xl leading-[0.85] mb-3">
            <span
              className="bg-gradient-to-br from-rose-500 via-fuchsia-500 to-orange-400 bg-clip-text text-transparent"
              style={{
                filter: 'drop-shadow(0 4px 24px rgba(244, 63, 94, 0.25))',
              }}
            >
              HEX
            </span>
            <br />
            <span className="bg-gradient-to-tr from-violet-500 via-rose-400 to-amber-300 bg-clip-text text-transparent">
              TOWER
            </span>
          </h1>
          <p className="font-mono text-sm text-stone-600 leading-relaxed mb-8 max-w-md mx-auto">
            Hop the hexes. Mint = combo. Peach = launch. Rose crumbles under
            your feet. Climb until gravity has the last word.
          </p>

          <CTA
            label={cta.label}
            spinning={ctl.isBusy}
            disabled={ctl.isBusy}
            onClick={ctl.enter}
          />

          <div className="mt-3 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-widest text-stone-600/70">
            <span>Entry · {ctl.feeSol} SOL</span>
            <span className="opacity-40">•</span>
            <span>Devnet</span>
            {bestM > 0 && (
              <>
                <span className="opacity-40">•</span>
                <span>Best · {bestM.toLocaleString()}m</span>
              </>
            )}
          </div>

          {ctl.error && (
            <div className="mt-4 mx-auto max-w-md flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-100/80 px-3 py-2 text-xs text-rose-800 font-mono">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span className="text-left">{ctl.error}</span>
              <button
                onClick={ctl.clearError}
                className="ml-auto text-rose-700/80 hover:text-rose-900"
              >
                dismiss
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-4 z-10 pointer-events-none flex items-center justify-center gap-6 font-mono text-[10px] uppercase tracking-[0.4em] text-stone-700/40">
        <span>WASD move</span>
        <span className="opacity-40">·</span>
        <span>Space jump</span>
        <span className="opacity-40">·</span>
        <span>Don't fall</span>
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
      className="group relative inline-flex items-center gap-3 rounded-full px-9 py-4 font-mono text-sm uppercase tracking-[0.3em] font-bold text-white transition-transform active:scale-[0.97] disabled:opacity-70 disabled:cursor-not-allowed"
      style={{
        background:
          'linear-gradient(135deg, #f43f5e 0%, #a78bfa 50%, #fb923c 100%)',
        boxShadow:
          '0 0 0 1px rgba(255,255,255,0.3) inset, 0 8px 30px -8px rgba(244,63,94,0.5), 0 16px 60px -10px rgba(167,139,250,0.4)',
      }}
    >
      <span className="absolute inset-0 rounded-full bg-white/0 group-hover:bg-white/15 transition-colors" />
      {spinning ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ArrowUp className="h-4 w-4" />
      )}
      <span className="relative">{label}</span>
    </button>
  );
}

function PastelBackdrop() {
  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, #ffe4d4 0%, #fcd1bf 30%, #c4b5fd 65%, #5b3a9a 100%)',
        }}
      />
      {/* Sun glow */}
      <div
        className="absolute left-1/2 top-[28%] h-72 w-72 -translate-x-1/2 rounded-full blur-3xl opacity-70"
        style={{
          background: 'radial-gradient(circle, #fde68a, transparent 70%)',
        }}
      />
      {/* Floating hex islands */}
      <HexFloaters />
      {/* Distant tower silhouette */}
      <TowerSilhouette />
      {/* Subtle vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(40,20,60,0.35) 100%)',
        }}
      />
    </div>
  );
}

function HexFloaters() {
  // Hexagons drifting gently at different speeds. Pure inline SVG so they
  // stay crisp at any resolution.
  const hexPath = 'M50 0 L93.3 25 L93.3 75 L50 100 L6.7 75 L6.7 25 Z';
  const items = [
    { x: 10, y: 70, size: 90, fill: '#fda4af', delay: '0s', dur: '7s' },
    { x: 84, y: 60, size: 70, fill: '#fdba74', delay: '1.5s', dur: '8s' },
    { x: 18, y: 22, size: 55, fill: '#86efac', delay: '2s', dur: '9s' },
    { x: 76, y: 24, size: 60, fill: '#a78bfa', delay: '0.5s', dur: '6.5s' },
    { x: 50, y: 78, size: 50, fill: '#fde68a', delay: '3s', dur: '7.5s' },
  ];
  return (
    <>
      <style jsx>{`
        @keyframes bob {
          0%, 100% { transform: translateY(0) rotate(0); }
          50% { transform: translateY(-12px) rotate(4deg); }
        }
        .hex {
          animation-name: bob;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          transform-origin: center;
        }
      `}</style>
      {items.map((h, i) => (
        <svg
          key={i}
          viewBox="0 0 100 100"
          className="hex absolute"
          style={{
            left: `${h.x}%`,
            top: `${h.y}%`,
            width: `${h.size}px`,
            height: `${h.size}px`,
            transform: 'translate(-50%, -50%)',
            animationDelay: h.delay,
            animationDuration: h.dur,
            filter: 'drop-shadow(0 8px 18px rgba(60, 30, 100, 0.25))',
            opacity: 0.85,
          }}
        >
          <path d={hexPath} fill={h.fill} />
          <path
            d={hexPath}
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="2"
          />
        </svg>
      ))}
    </>
  );
}

function TowerSilhouette() {
  // Stack of hex platforms behind the title — looks like the tower seen from
  // a distance.
  const hexPath = 'M50 0 L93.3 25 L93.3 75 L50 100 L6.7 75 L6.7 25 Z';
  const rings = Array.from({ length: 12 }).map((_, i) => i);
  return (
    <svg
      viewBox="0 0 600 400"
      className="absolute left-1/2 top-1/2 w-[120%] max-w-[900px] -translate-x-1/2 -translate-y-[42%] opacity-25 pointer-events-none"
      preserveAspectRatio="xMidYMid meet"
    >
      {rings.map((i) => {
        const y = 220 - i * 18;
        const scale = 1 - i * 0.06;
        return (
          <g
            key={i}
            transform={`translate(300, ${y}) scale(${scale}) translate(-50, 0)`}
          >
            <path d={hexPath} fill="rgba(60, 30, 100, 0.7)" />
          </g>
        );
      })}
    </svg>
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
  if (!connected) return { label: 'Connect to climb' };
  return { label: 'Begin ascent' };
}
