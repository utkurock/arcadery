'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Zap } from 'lucide-react';
import {
  usePayToPlay,
  type PayToPlayContext,
} from '@/components/games/_shared/use-pay-to-play';
import { WalletChip } from '@/components/games/_shared/wallet-chip';

// Cube Runner intro — synthwave horizon vibe. CSS-perspective grid floor +
// pink sun + scrolling lane stripes.

interface Props {
  onEntered: (ctx: PayToPlayContext) => void;
}

export function CubeRunnerIntro({ onEntered }: Props) {
  const ctl = usePayToPlay({ gameKey: 'cube-runner', onEntered });
  const [bestM, setBestM] = useState(0);
  useEffect(() => {
    try {
      setBestM(Number(localStorage.getItem('arcadery:cube-runner:best') ?? 0));
    } catch {}
  }, []);

  const cta = ctaLabel(ctl.phase, ctl.connected);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <SynthwaveBackdrop />

      <div className="absolute top-3 right-3 z-20">
        <WalletChip
          connected={ctl.connected}
          walletAddress={ctl.walletAddress}
          tone={{
            chip: 'border-fuchsia-300/40 bg-fuchsia-400/10 text-fuchsia-100',
            dot: 'bg-emerald-400',
          }}
        />
      </div>

      <div className="pointer-events-none absolute top-3 left-3 z-20 font-mono text-[10px] uppercase tracking-[0.3em] text-fuchsia-300/70 flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-fuchsia-400 animate-pulse" />
        Start line · idling
      </div>

      <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
        <div className="w-full max-w-xl text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-fuchsia-300/80 mb-3">
            Synthwave · endless lanes
          </p>
          <h1 className="font-black tracking-tight text-6xl sm:text-7xl leading-[0.85] mb-3 text-white">
            <span
              className="bg-gradient-to-br from-pink-300 via-fuchsia-300 to-violet-300 bg-clip-text text-transparent"
              style={{
                filter:
                  'drop-shadow(0 0 36px rgba(244, 114, 182, 0.45))',
              }}
            >
              CUBE
            </span>
            <br />
            <span className="bg-gradient-to-r from-amber-200 via-pink-300 to-violet-300 bg-clip-text text-transparent">
              RUNNER
            </span>
          </h1>
          <p className="font-mono text-sm text-white/65 leading-relaxed mb-8 max-w-md mx-auto">
            Switch lanes. Hop the blocks. Slide under the beams. The road keeps
            getting faster — and so do you.
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
        <span>A · D lanes</span>
        <span className="opacity-40">·</span>
        <span>Space jump</span>
        <span className="opacity-40">·</span>
        <span>S slide</span>
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
          'linear-gradient(135deg, #ec4899 0%, #a855f7 50%, #4f46e5 100%)',
        boxShadow:
          '0 0 0 1px rgba(255,255,255,0.25) inset, 0 8px 30px -8px rgba(236,72,153,0.5), 0 16px 60px -10px rgba(79,70,229,0.5)',
      }}
    >
      <span className="absolute inset-0 rounded-full bg-white/0 group-hover:bg-white/10 transition-colors" />
      {spinning ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Zap className="h-4 w-4" />
      )}
      <span className="relative">{label}</span>
    </button>
  );
}

function SynthwaveBackdrop() {
  return (
    <div className="absolute inset-0">
      {/* Sky gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #1e0a3a 0%, #4c1d95 30%, #ea580c 65%, #f97316 75%, #fdba74 80%, #4c1d95 100%)',
        }}
      />
      {/* Sun */}
      <div
        className="absolute left-1/2 top-[42%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle, #fde047 0%, #f97316 50%, transparent 70%)',
          boxShadow: '0 0 80px 20px rgba(249,115,22,0.4)',
        }}
      />
      {/* Sun horizontal slits */}
      {[0.42, 0.45, 0.48, 0.51, 0.54].map((t, i) => (
        <div
          key={i}
          className="absolute left-1/2 -translate-x-1/2 h-1 w-72 rounded-full bg-[#4c1d95]"
          style={{ top: `${t * 100}%`, opacity: 1 - i * 0.15 }}
        />
      ))}
      {/* Perspective grid floor */}
      <GridFloor />
      {/* Mountains silhouette */}
      <svg
        viewBox="0 0 1200 200"
        className="absolute inset-x-0 top-[50%] -translate-y-full w-full h-32 opacity-60 pointer-events-none"
        preserveAspectRatio="none"
      >
        <path
          d="M0 200 L0 90 L120 30 L200 90 L320 20 L420 100 L520 40 L640 120 L760 30 L880 110 L1000 50 L1120 100 L1200 60 L1200 200 Z"
          fill="rgba(40, 10, 70, 0.85)"
        />
      </svg>
      {/* Top vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 35%, transparent 30%, rgba(0,0,0,0.55) 100%)',
        }}
      />
    </div>
  );
}

function GridFloor() {
  // CSS perspective grid. Two repeating linear-gradients give us horizontal
  // and vertical lines, and a perspective transform pushes them away from
  // the camera. An animation translates the floor toward us to fake motion.
  return (
    <>
      <style jsx>{`
        @keyframes drive {
          from { background-position: 0 0; }
          to { background-position: 0 60px; }
        }
        .floor {
          position: absolute;
          left: -25%;
          right: -25%;
          bottom: -10%;
          height: 65%;
          transform: perspective(620px) rotateX(58deg);
          transform-origin: 50% 0%;
          background-image:
            linear-gradient(rgba(244, 114, 182, 0.55) 1px, transparent 1px),
            linear-gradient(90deg, rgba(244, 114, 182, 0.55) 1px, transparent 1px);
          background-size: 60px 60px;
          animation: drive 1.3s linear infinite;
        }
        .floor::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(76, 29, 149, 0.85) 0%, rgba(15, 5, 30, 0.7) 80%, transparent 100%);
          mix-blend-mode: multiply;
        }
      `}</style>
      <div className="floor" />
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
  if (!connected) return { label: 'Connect to run' };
  return { label: 'Start the run' };
}
