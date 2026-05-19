'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Rocket } from 'lucide-react';
import {
  usePayToPlay,
  type PayToPlayContext,
} from '@/components/games/_shared/use-pay-to-play';
import { WalletChip } from '@/components/games/_shared/wallet-chip';

// Neon Asteroids intro — black starfield with drifting vector polygons that
// preview the gameplay's wireframe look. The hero ship sits centered and
// blinks an i-frame strobe.

interface Props {
  onEntered: (ctx: PayToPlayContext) => void;
}

export function NeonAsteroidsIntro({ onEntered }: Props) {
  const ctl = usePayToPlay({ gameKey: 'neon-asteroids', onEntered });
  const [bestScore, setBestScore] = useState(0);
  useEffect(() => {
    try {
      setBestScore(
        Number(localStorage.getItem('arcadery:neon-asteroids:hs') ?? 0),
      );
    } catch {}
  }, []);

  const cta = ctaLabel(ctl.phase, ctl.connected);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <SpaceBackdrop />

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
        Hangar · prep
      </div>

      <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
        <div className="w-full max-w-xl text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-cyan-300/70 mb-3">
            Vector arcade · waves
          </p>
          <h1 className="font-black tracking-tight text-6xl sm:text-7xl leading-[0.85] mb-3 text-white">
            <span
              className="bg-gradient-to-br from-cyan-200 via-cyan-300 to-fuchsia-300 bg-clip-text text-transparent"
              style={{
                filter:
                  'drop-shadow(0 0 30px rgba(34, 211, 238, 0.45))',
              }}
            >
              NEON
            </span>
            <br />
            <span className="bg-gradient-to-r from-fuchsia-300 via-rose-300 to-amber-300 bg-clip-text text-transparent">
              ASTEROIDS
            </span>
          </h1>
          <p className="font-mono text-sm text-white/60 leading-relaxed mb-8 max-w-md mx-auto">
            Tumble through endless asteroid waves in a glowing wireframe void.
            Chain hits to multiply scores. Don't get atomized.
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
        <span>A · D rotate</span>
        <span className="opacity-40">·</span>
        <span>W thrust</span>
        <span className="opacity-40">·</span>
        <span>Space fire</span>
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
          'linear-gradient(135deg, #67e8f9 0%, #c084fc 50%, #f0abfc 100%)',
        boxShadow:
          '0 0 0 1px rgba(255,255,255,0.25) inset, 0 8px 30px -8px rgba(103,232,249,0.5), 0 16px 60px -10px rgba(192,132,252,0.45)',
      }}
    >
      <span className="absolute inset-0 rounded-full bg-white/0 group-hover:bg-white/10 transition-colors" />
      {spinning ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Rocket className="h-4 w-4" />
      )}
      <span className="relative">{label}</span>
    </button>
  );
}

function SpaceBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
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

    // Starfield + drifting vector polygons.
    const stars = Array.from({ length: 140 }).map(() => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.3 + Math.random() * 1.6,
      brightness: 0.4 + Math.random() * 0.6,
    }));
    interface Poly {
      x: number;
      y: number;
      vx: number;
      vy: number;
      angle: number;
      spin: number;
      size: number;
      verts: number;
      shape: number[];
      hue: number;
    }
    const polys: Poly[] = Array.from({ length: 7 }).map(() => {
      const verts = 7 + Math.floor(Math.random() * 4);
      return {
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.0006,
        vy: (Math.random() - 0.5) * 0.0006,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.006,
        size: 18 + Math.random() * 38,
        verts,
        shape: Array.from({ length: verts }, () => Math.random()),
        hue: 250 + Math.random() * 80,
      };
    });

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Stars.
      for (const s of stars) {
        ctx.fillStyle = `rgba(255, 255, 255, ${s.brightness * 0.6})`;
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Polygons — glowing line wireframes.
      for (const p of polys) {
        p.x = (p.x + p.vx + 1) % 1;
        p.y = (p.y + p.vy + 1) % 1;
        p.angle += p.spin;
        ctx.save();
        ctx.translate(p.x * w, p.y * h);
        ctx.rotate(p.angle);
        ctx.shadowColor = `hsla(${p.hue}, 90%, 65%, 0.7)`;
        ctx.shadowBlur = 14 * dpr;
        ctx.strokeStyle = `hsla(${p.hue}, 85%, 70%, 0.9)`;
        ctx.lineWidth = 1.6 * dpr;
        ctx.beginPath();
        for (let k = 0; k < p.verts; k++) {
          const a = (k / p.verts) * Math.PI * 2;
          const r = p.size * dpr * (0.75 + p.shape[k] * 0.5);
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
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
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, #0a1130 0%, #060916 60%, #02030a 100%)',
        }}
      />
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      {/* Subtle nebula sheen behind title */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[460px] w-[460px] rounded-full blur-3xl opacity-40 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(168,85,247,0.45), transparent 60%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.65) 100%)',
        }}
      />
    </div>
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
  if (!connected) return { label: 'Connect to launch' };
  return { label: 'Launch the ship' };
}
