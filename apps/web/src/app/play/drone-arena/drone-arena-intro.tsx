'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Radar } from 'lucide-react';
import {
  usePayToPlay,
  type PayToPlayContext,
} from '@/components/games/_shared/use-pay-to-play';
import { WalletChip } from '@/components/games/_shared/wallet-chip';

// Drone Arena intro — holographic colosseum vibe. Sweeping radar arc, target
// reticule, scan grid. Canvas does the radar/contacts; CSS handles the
// rest.

interface Props {
  onEntered: (ctx: PayToPlayContext) => void;
}

export function DroneArenaIntro({ onEntered }: Props) {
  const ctl = usePayToPlay({ gameKey: 'drone-arena', onEntered });
  const [bestScore, setBestScore] = useState(0);
  useEffect(() => {
    try {
      setBestScore(
        Number(localStorage.getItem('arcadery:drone-arena:best') ?? 0),
      );
    } catch {}
  }, []);

  const cta = ctaLabel(ctl.phase, ctl.connected);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <ArenaBackdrop />

      <div className="absolute top-3 right-3 z-20">
        <WalletChip
          connected={ctl.connected}
          walletAddress={ctl.walletAddress}
          tone={{
            chip: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100',
            dot: 'bg-emerald-400',
          }}
        />
      </div>

      {/* Top-left HUD-style status strip */}
      <div className="pointer-events-none absolute top-3 left-3 z-20 font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">
        Arena · pre-deploy
      </div>

      <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
        <div className="w-full max-w-xl text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-cyan-300/70 mb-3">
            Holographic · combat
          </p>
          <h1 className="font-black tracking-tight text-6xl sm:text-7xl leading-[0.85] mb-3 text-white">
            <span
              className="bg-gradient-to-r from-cyan-200 via-white to-violet-300 bg-clip-text text-transparent"
              style={{
                filter: 'drop-shadow(0 0 30px rgba(103, 232, 249, 0.45))',
              }}
            >
              DRONE
            </span>
            <br />
            <span className="bg-gradient-to-r from-fuchsia-300 via-cyan-300 to-cyan-200 bg-clip-text text-transparent">
              ARENA
            </span>
          </h1>
          <p className="font-mono text-sm text-white/60 leading-relaxed mb-8 max-w-md mx-auto">
            Dash. Lock. Volley. Outlast escalating drone swarms in the
            colosseum — auto-aim blasters, homing missiles, three hulls to
            burn.
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

      <div className="absolute inset-x-0 bottom-4 z-10 pointer-events-none flex items-center justify-center gap-6 font-mono text-[10px] uppercase tracking-[0.4em] text-cyan-200/30">
        <span>WASD move</span>
        <span className="opacity-40">·</span>
        <span>Space fire</span>
        <span className="opacity-40">·</span>
        <span>F missile</span>
        <span className="opacity-40">·</span>
        <span>Shift dash</span>
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
          'linear-gradient(135deg, #67e8f9 0%, #c084fc 60%, #f0abfc 100%)',
        boxShadow:
          '0 0 0 1px rgba(255,255,255,0.25) inset, 0 8px 30px -8px rgba(103,232,249,0.5), 0 16px 60px -10px rgba(168,85,247,0.5)',
      }}
    >
      <span className="absolute inset-0 rounded-full bg-white/0 group-hover:bg-white/10 transition-colors" />
      {spinning ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Radar className="h-4 w-4" />
      )}
      <span className="relative">{label}</span>
    </button>
  );
}

// Background: animated radar canvas behind a static holographic grid + side
// pillars (CSS).
function ArenaBackdrop() {
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

    // Simulated radar contacts that fade in/out.
    const contacts = Array.from({ length: 8 }).map(() => ({
      angle: Math.random() * Math.PI * 2,
      r: 0.2 + Math.random() * 0.7,
      ttl: Math.random(),
      hue: 350 + Math.random() * 30,
    }));
    let sweepAngle = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.45;

      sweepAngle = (now * 0.0008) % (Math.PI * 2);

      // Radar concentric rings.
      ctx.strokeStyle = 'rgba(103, 232, 249, 0.18)';
      ctx.lineWidth = 1 * dpr;
      for (let r = 1; r <= 4; r++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (radius / 4) * r, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Cross-hairs.
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.stroke();

      // Sweep wedge.
      const wedge = ctx.createConicGradient
        ? ctx.createConicGradient(sweepAngle - Math.PI / 4, cx, cy)
        : null;
      if (wedge) {
        wedge.addColorStop(0, 'rgba(103, 232, 249, 0.35)');
        wedge.addColorStop(0.18, 'rgba(103, 232, 249, 0)');
        wedge.addColorStop(1, 'rgba(103, 232, 249, 0)');
        ctx.fillStyle = wedge;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Fallback line sweep for older browsers.
        ctx.strokeStyle = 'rgba(103, 232, 249, 0.45)';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(
          cx + Math.cos(sweepAngle) * radius,
          cy + Math.sin(sweepAngle) * radius,
        );
        ctx.stroke();
      }

      // Contacts.
      for (const c of contacts) {
        c.ttl -= 0.005;
        if (c.ttl <= 0) {
          c.ttl = 1;
          c.angle = Math.random() * Math.PI * 2;
          c.r = 0.25 + Math.random() * 0.65;
        }
        const x = cx + Math.cos(c.angle) * c.r * radius;
        const y = cy + Math.sin(c.angle) * c.r * radius;
        ctx.fillStyle = `hsla(${c.hue}, 90%, 60%, ${c.ttl * 0.85})`;
        ctx.beginPath();
        ctx.arc(x, y, 4 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `hsla(${c.hue}, 90%, 70%, ${c.ttl * 0.5})`;
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, 10 * dpr * (1 - c.ttl), 0, Math.PI * 2);
        ctx.stroke();
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
      {/* Base gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, #0a1233 0%, #060a1c 60%, #03050d 100%)',
        }}
      />
      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            'linear-gradient(rgba(103,232,249,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.18) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          maskImage:
            'radial-gradient(ellipse at center, black 30%, transparent 80%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        }}
      />
      {/* Radar canvas */}
      <canvas ref={ref} className="absolute inset-0 h-full w-full opacity-80" />
      {/* Sweeping scan band */}
      <ScanLine />
      {/* Pillar silhouettes on both sides */}
      <Pillars />
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

function ScanLine() {
  return (
    <>
      <style jsx>{`
        @keyframes scan {
          0% {
            transform: translateY(-30%);
            opacity: 0;
          }
          25% {
            opacity: 1;
          }
          75% {
            opacity: 1;
          }
          100% {
            transform: translateY(130%);
            opacity: 0;
          }
        }
        .scan {
          animation: scan 5.5s ease-in-out infinite;
        }
      `}</style>
      <div
        className="scan absolute inset-x-0 h-24"
        style={{
          background:
            'linear-gradient(to bottom, transparent, rgba(103,232,249,0.18), transparent)',
        }}
      />
    </>
  );
}

function Pillars() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {[10, 90].map((x) => (
        <div
          key={x}
          className="absolute top-1/2 -translate-y-1/2 h-[55%] w-2"
          style={{
            left: `${x}%`,
            background:
              'linear-gradient(180deg, transparent, rgba(99,102,241,0.5), transparent)',
            boxShadow:
              '0 0 20px 6px rgba(99,102,241,0.3)',
          }}
        />
      ))}
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
  if (!connected) return { label: 'Connect to deploy' };
  return { label: 'Deploy to arena' };
}
