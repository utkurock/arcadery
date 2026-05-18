'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, KeyRound, Loader2 } from 'lucide-react';
import {
  usePayToPlay,
  type PayToPlayContext,
} from '@/components/games/_shared/use-pay-to-play';
import { WalletChip } from '@/components/games/_shared/wallet-chip';

// Voxel Heist intro — dark vault hall with a single dramatic gold vault
// silhouette and lazy laser sweep. Sets the "60 seconds. 8 vaults." mood.

interface Props {
  onEntered: (ctx: PayToPlayContext) => void;
}

export function VoxelHeistIntro({ onEntered }: Props) {
  const ctl = usePayToPlay({ gameKey: 'voxel-heist', onEntered });
  const [bestScore, setBestScore] = useState(0);
  useEffect(() => {
    try {
      setBestScore(
        Number(localStorage.getItem('arcadery:voxel-heist:best') ?? 0),
      );
    } catch {}
  }, []);

  const cta = ctaLabel(ctl.phase, ctl.connected);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <VaultBackdrop />

      <div className="absolute top-3 right-3 z-20">
        <WalletChip
          connected={ctl.connected}
          walletAddress={ctl.walletAddress}
          tone={{
            chip: 'border-amber-400/40 bg-amber-400/10 text-amber-100',
            dot: 'bg-amber-300',
          }}
        />
      </div>

      {/* Top-left "clock" mood strip */}
      <div className="pointer-events-none absolute top-3 left-3 z-20 font-mono text-[10px] uppercase tracking-[0.3em] text-amber-300/70 flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
        Alarm armed · 60s
      </div>

      <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
        <div className="w-full max-w-xl text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-amber-300/80 mb-3">
            Stealth · speedrun
          </p>
          <h1 className="font-black tracking-tight text-6xl sm:text-7xl leading-[0.85] mb-3 text-white">
            <span
              className="bg-gradient-to-br from-amber-200 via-amber-400 to-orange-500 bg-clip-text text-transparent"
              style={{
                filter:
                  'drop-shadow(0 4px 30px rgba(251, 191, 36, 0.4))',
              }}
            >
              VOXEL
            </span>
            <br />
            <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-amber-200 bg-clip-text text-transparent">
              HEIST
            </span>
          </h1>
          <p className="font-mono text-sm text-white/60 leading-relaxed mb-8 max-w-md mx-auto">
            Sixty seconds. Eight vaults. Slip the laser grids, hold E to crack
            the safe, exfil before the clock zeroes.
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

      <div className="absolute inset-x-0 bottom-4 z-10 pointer-events-none flex items-center justify-center gap-6 font-mono text-[10px] uppercase tracking-[0.4em] text-amber-200/40">
        <span>WASD move</span>
        <span className="opacity-40">·</span>
        <span>Shift sprint</span>
        <span className="opacity-40">·</span>
        <span>E crack</span>
        <span className="opacity-40">·</span>
        <span>Avoid red</span>
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
      className="group relative inline-flex items-center gap-3 rounded-full px-9 py-4 font-mono text-sm uppercase tracking-[0.3em] font-bold text-stone-900 transition-transform active:scale-[0.97] disabled:opacity-70 disabled:cursor-not-allowed"
      style={{
        background:
          'linear-gradient(135deg, #fde047 0%, #f97316 60%, #a855f7 100%)',
        boxShadow:
          '0 0 0 1px rgba(255,255,255,0.3) inset, 0 8px 30px -8px rgba(253,224,71,0.5), 0 16px 60px -10px rgba(249,115,22,0.4)',
      }}
    >
      <span className="absolute inset-0 rounded-full bg-white/0 group-hover:bg-white/15 transition-colors" />
      {spinning ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <KeyRound className="h-4 w-4" />
      )}
      <span className="relative">{label}</span>
    </button>
  );
}

function VaultBackdrop() {
  return (
    <div className="absolute inset-0">
      {/* Dark base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 65%, #2a1a0a 0%, #110a18 45%, #06080d 100%)',
        }}
      />
      {/* Distant vault silhouette */}
      <VaultSilhouette />
      {/* Sweeping laser line */}
      <LaserSweep />
      {/* Voxel column silhouettes */}
      <VoxelColumns />
      {/* Atmospheric particles */}
      <Particles />
      {/* Glowing safe halo behind title */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[420px] w-[420px] rounded-full pointer-events-none blur-3xl opacity-50"
        style={{
          background:
            'radial-gradient(circle, rgba(253,224,71,0.5), transparent 65%)',
        }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.75) 100%)',
        }}
      />
    </div>
  );
}

function VaultSilhouette() {
  return (
    <svg
      viewBox="0 0 400 400"
      className="absolute left-1/2 bottom-[12%] -translate-x-1/2 w-[280px] h-[280px] opacity-50 pointer-events-none"
    >
      <defs>
        <radialGradient id="voxelHeistVaultGlow">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.6" />
          <stop offset="60%" stopColor="#fbbf24" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="180" fill="url(#voxelHeistVaultGlow)" />
      {/* Vault body */}
      <rect
        x="80"
        y="80"
        width="240"
        height="240"
        rx="14"
        fill="rgba(60,30,80,0.85)"
        stroke="rgba(251,191,36,0.4)"
        strokeWidth="2"
      />
      {/* Door circle */}
      <circle
        cx="200"
        cy="200"
        r="80"
        fill="rgba(40,20,60,0.95)"
        stroke="rgba(251,191,36,0.7)"
        strokeWidth="3"
      />
      <circle
        cx="200"
        cy="200"
        r="55"
        fill="none"
        stroke="rgba(251,191,36,0.5)"
        strokeWidth="2"
      />
      {/* Spokes */}
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <line
          key={deg}
          x1="200"
          y1="200"
          x2={200 + Math.cos((deg * Math.PI) / 180) * 78}
          y2={200 + Math.sin((deg * Math.PI) / 180) * 78}
          stroke="rgba(251,191,36,0.5)"
          strokeWidth="3"
        />
      ))}
      {/* Center bolt */}
      <circle cx="200" cy="200" r="12" fill="#fbbf24" />
    </svg>
  );
}

function LaserSweep() {
  return (
    <>
      <style jsx>{`
        @keyframes laser-sweep {
          0% {
            transform: translateX(-30%) rotate(8deg);
            opacity: 0;
          }
          25% {
            opacity: 1;
          }
          75% {
            opacity: 1;
          }
          100% {
            transform: translateX(130%) rotate(8deg);
            opacity: 0;
          }
        }
        .laser {
          animation: laser-sweep 7s ease-in-out infinite;
        }
      `}</style>
      <div
        className="laser absolute inset-y-0 w-2 -ml-1"
        style={{
          background:
            'linear-gradient(180deg, transparent, rgba(244,63,94,0.85) 50%, transparent)',
          boxShadow: '0 0 18px 4px rgba(244,63,94,0.5)',
        }}
      />
    </>
  );
}

function VoxelColumns() {
  // Tall voxel pillar silhouettes on each side of the vault, evoking the
  // chunky maze pillars from the gameplay.
  const cols = [
    { left: 8, h: 60, dxStack: [0, -8, 6] },
    { left: 22, h: 78, dxStack: [0, 6] },
    { left: 78, h: 70, dxStack: [0, -6, 4] },
    { left: 92, h: 55, dxStack: [0, 4] },
  ];
  return (
    <div className="absolute inset-x-0 bottom-0 h-[70%] pointer-events-none">
      {cols.map((c, i) => (
        <div
          key={i}
          className="absolute bottom-0 flex flex-col items-center"
          style={{ left: `${c.left}%`, height: `${c.h}%` }}
        >
          {c.dxStack.map((dx, j) => (
            <div
              key={j}
              className="bg-stone-900/85"
              style={{
                width: `${60 - j * 6}px`,
                height: `${(c.h / c.dxStack.length) * 0.9}%`,
                marginLeft: `${dx}px`,
                boxShadow: 'inset 0 0 1px rgba(251,191,36,0.15)',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Particles() {
  // Tiny dust motes drifting upward — pure CSS keyframes per particle.
  const motes = Array.from({ length: 12 }).map((_, i) => ({
    left: 5 + Math.random() * 90,
    delay: -Math.random() * 8,
    duration: 10 + Math.random() * 8,
    size: 1 + Math.random() * 2,
    drift: Math.random() < 0.5 ? -1 : 1,
  }));
  return (
    <>
      <style jsx>{`
        @keyframes mote {
          0% {
            transform: translate3d(0, 0, 0);
            opacity: 0;
          }
          10% {
            opacity: 0.7;
          }
          90% {
            opacity: 0.5;
          }
          100% {
            transform: translate3d(var(--drift), -110vh, 0);
            opacity: 0;
          }
        }
        .mote {
          position: absolute;
          bottom: -2vh;
          background: rgba(253, 224, 71, 0.55);
          border-radius: 9999px;
          box-shadow: 0 0 8px 1px rgba(253, 224, 71, 0.35);
          animation-name: mote;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
      `}</style>
      {motes.map((m, i) => (
        <span
          key={i}
          className="mote pointer-events-none"
          style={
            {
              left: `${m.left}%`,
              width: `${m.size}px`,
              height: `${m.size}px`,
              animationDelay: `${m.delay}s`,
              animationDuration: `${m.duration}s`,
              ['--drift' as string]: `${m.drift * 18}vw`,
            } as React.CSSProperties
          }
        />
      ))}
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
  if (!connected) return { label: 'Connect to crack' };
  return { label: 'Crack the vaults' };
}
