'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Wind } from 'lucide-react';
import {
  usePayToPlay,
  type PayToPlayContext,
} from '@/components/games/_shared/use-pay-to-play';
import { WalletChip } from '@/components/games/_shared/wallet-chip';

// Sky Glider intro screen — themed neon canyon vibe. Backdrop is a
// CSS-animated parallax of horizontal "ridge" gradients receding into the
// distance plus drifting starfield, evocative of the canyon-flying gameplay
// without booting the full Three.js scene on the menu.

interface Props {
  onEntered: (ctx: PayToPlayContext) => void;
}

export function SkyGliderIntro({ onEntered }: Props) {
  const ctl = usePayToPlay({ gameKey: 'sky-glider', onEntered });
  const [bestM, setBestM] = useState(0);
  useEffect(() => {
    try {
      setBestM(Number(localStorage.getItem('arcadery:sky-glider:best') ?? 0));
    } catch {}
  }, []);

  const cta = ctaLabel(ctl.phase, ctl.connected);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <CanyonBackdrop />

      {/* Top corners */}
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

      <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
        <div className="w-full max-w-xl text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-cyan-300/70 mb-3">
            Neon canyon · wingsuit
          </p>
          <h1 className="font-black tracking-tight text-white text-6xl sm:text-7xl leading-[0.85] mb-3">
            <span className="bg-gradient-to-br from-cyan-200 via-cyan-400 to-indigo-400 bg-clip-text text-transparent drop-shadow-[0_4px_30px_rgba(34,211,238,0.4)]">
              SKY
            </span>
            <br />
            <span className="bg-gradient-to-tr from-indigo-300 via-fuchsia-300 to-cyan-200 bg-clip-text text-transparent">
              GLIDER
            </span>
          </h1>
          <p className="font-mono text-sm text-white/60 leading-relaxed mb-8 max-w-md mx-auto">
            Thread the ravine. Chain rings for combo. Hold the line at terminal
            velocity until the canyon takes you.
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
            {bestM > 0 && (
              <>
                <span className="opacity-40">•</span>
                <span>Best · {bestM.toLocaleString()}m</span>
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
        <span>WASD steer</span>
        <span className="opacity-40">·</span>
        <span>Space boost</span>
        <span className="opacity-40">·</span>
        <span>Rings = combo</span>
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
          'linear-gradient(135deg, #67e8f9 0%, #818cf8 50%, #f0abfc 100%)',
        boxShadow:
          '0 0 0 1px rgba(255,255,255,0.2) inset, 0 8px 30px -8px rgba(103,232,249,0.6), 0 16px 60px -10px rgba(129,140,248,0.4)',
      }}
    >
      <span className="absolute inset-0 rounded-full bg-white/0 group-hover:bg-white/10 transition-colors" />
      {spinning ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Wind className="h-4 w-4" />
      )}
      <span className="relative">{label}</span>
    </button>
  );
}

// Themed background — pure CSS+SVG, no Three.js boot.
function CanyonBackdrop() {
  const starRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = starRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const onResize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    onResize();
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);

    const stars = Array.from({ length: 90 }).map(() => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.3 + Math.random() * 1.2,
      vy: 0.0006 + Math.random() * 0.0024,
      hue: Math.random() < 0.85 ? 200 + Math.random() * 30 : 290,
    }));

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.y += s.vy;
        if (s.y > 1) s.y = 0;
        ctx.fillStyle = `hsla(${s.hue}, 80%, 80%, ${0.4 + s.r * 0.3})`;
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="absolute inset-0">
      {/* Base gradient (sky → void) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 100%, #1e1b4b 0%, #0c0a2a 40%, #05070f 100%)',
        }}
      />
      {/* Distant aurora ribbon */}
      <div
        className="absolute inset-x-0 top-1/3 h-32 opacity-30 blur-3xl"
        style={{
          background:
            'linear-gradient(90deg, transparent, #22d3ee 30%, #a855f7 70%, transparent)',
        }}
      />
      {/* Canyon ridges — parallax with css animation */}
      <CanyonRidges />
      {/* Starfield (canvas) */}
      <canvas ref={starRef} className="absolute inset-0 h-full w-full" />
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%)',
        }}
      />
    </div>
  );
}

function CanyonRidges() {
  // Three SVG ridge layers, each scaled and offset for parallax. The
  // animation pans them horizontally at different speeds so the canyon feels
  // alive without paying for a real 3D render.
  return (
    <>
      <style jsx>{`
        @keyframes drift-1 {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-200px);
          }
        }
        @keyframes drift-2 {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-140px);
          }
        }
        @keyframes drift-3 {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-80px);
          }
        }
        .ridge-near {
          animation: drift-1 24s linear infinite alternate;
        }
        .ridge-mid {
          animation: drift-2 36s linear infinite alternate;
        }
        .ridge-far {
          animation: drift-3 52s linear infinite alternate;
        }
      `}</style>
      <svg
        className="ridge-far absolute inset-x-0 bottom-[18%] w-[140%] -ml-[20%] opacity-40"
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
      >
        <path
          d="M0 200 L0 130 C100 110 200 140 300 120 C400 100 500 150 600 130 C700 110 800 90 900 100 C1000 110 1100 130 1200 110 L1200 200 Z"
          fill="rgba(58, 29, 138, 0.7)"
        />
      </svg>
      <svg
        className="ridge-mid absolute inset-x-0 bottom-[12%] w-[140%] -ml-[20%] opacity-60"
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
      >
        <path
          d="M0 200 L0 150 C150 130 250 160 350 140 C500 110 600 170 720 150 C860 130 980 110 1080 130 C1140 140 1180 130 1200 130 L1200 200 Z"
          fill="rgba(76, 29, 149, 0.85)"
        />
      </svg>
      <svg
        className="ridge-near absolute inset-x-0 bottom-0 w-[140%] -ml-[20%]"
        viewBox="0 0 1200 220"
        preserveAspectRatio="none"
      >
        <path
          d="M0 220 L0 170 C80 150 170 180 280 160 C390 140 470 180 580 160 C700 140 820 170 920 150 C1020 130 1120 160 1200 140 L1200 220 Z"
          fill="rgba(20, 10, 58, 1)"
        />
      </svg>
      {/* Glow line along the near ridge for the Tron-grid feel */}
      <div className="ridge-near absolute inset-x-0 bottom-0 h-[12%] pointer-events-none">
        <div
          className="absolute inset-x-0 top-0 h-px opacity-90"
          style={{
            background:
              'linear-gradient(90deg, transparent, #22d3ee 30%, #a78bfa 60%, transparent)',
            boxShadow: '0 0 12px 2px rgba(34, 211, 238, 0.5)',
          }}
        />
      </div>
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
  if (!connected) return { label: 'Connect to drop in' };
  return { label: 'Drop into the canyon' };
}
