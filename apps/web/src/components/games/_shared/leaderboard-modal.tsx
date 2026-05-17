'use client';

import { useEffect, useState } from 'react';
import { Trophy, X } from 'lucide-react';

// Generic leaderboard modal for built-in arcade games. The parent passes
// a `gameKey` (drift-racer | neon-asteroids | cube-runner | brick-smash)
// and a config telling it which numeric column to display as the rank value.
//
// The fetch path is /api/games/<gameKey>/scores and the response shape is
// `{ entries: Array<row> }` where each row has the column the modal renders.

export interface LeaderboardConfig {
  gameKey: 'drift-racer' | 'neon-asteroids' | 'cube-runner' | 'brick-smash';
  title: string;
  primaryLabel: string;
  /** column to read on each row to render the rank value */
  primaryField:
    | 'score'
    | 'distance_m'
    | 'best_lap_sec';
  /** Optional secondary metric (e.g. wave, coins, drift_score) */
  secondaryLabel?: string;
  secondaryField?:
    | 'wave_reached'
    | 'coins'
    | 'level_reached'
    | 'drift_score'
    | 'bricks_destroyed';
  /** Format the primary value (eg "12500" or "0:47.123"). */
  formatPrimary?: (v: number) => string;
  formatSecondary?: (v: number) => string;
  /** "asc" if lower is better (drift lap times), otherwise "desc". */
  order?: 'asc' | 'desc';
}

interface Entry {
  id: string;
  wallet_address: string;
  display_name: string | null;
  created_at: string;
  [key: string]: unknown;
}

export function LeaderboardModal({
  open,
  onClose,
  config,
  highlightWallet,
}: {
  open: boolean;
  onClose: () => void;
  config: LeaderboardConfig;
  highlightWallet?: string | null;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setEntries(null);
    setError(null);
    fetch(`/api/games/${config.gameKey}/scores?limit=20`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.error) setError(j.error);
        else setEntries(j.entries ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load leaderboard');
      });
    return () => {
      cancelled = true;
    };
  }, [open, config.gameKey]);

  if (!open) return null;

  const fmtP = config.formatPrimary ?? defaultFormat;
  const fmtS = config.formatSecondary ?? defaultFormat;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm font-mono">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0c0e16] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-300" />
            <h2 className="text-lg font-bold text-white">{config.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
            aria-label="Close leaderboard"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-[2rem_1fr_auto_auto] gap-3 text-[10px] uppercase tracking-widest text-white/40 mb-2">
          <span>#</span>
          <span>Wallet</span>
          {config.secondaryLabel && <span className="text-right">{config.secondaryLabel}</span>}
          <span className="text-right">{config.primaryLabel}</span>
        </div>

        {error ? (
          <div className="text-sm text-rose-400 py-6 text-center">{error}</div>
        ) : entries === null ? (
          <div className="text-sm text-white/40 py-8 text-center">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="text-sm text-white/40 py-8 text-center">
            No scores yet. Be the first.
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto pr-2">
            {entries.map((e, i) => {
              const primary = Number(e[config.primaryField]) || 0;
              const secondary =
                config.secondaryField != null ? Number(e[config.secondaryField]) || 0 : null;
              const isMe =
                highlightWallet && e.wallet_address === highlightWallet;
              return (
                <div
                  key={e.id}
                  className={`grid grid-cols-[2rem_1fr_auto_auto] gap-3 items-center text-sm py-2 border-b border-white/[0.04] ${
                    isMe ? 'bg-amber-400/10 -mx-3 px-3 rounded' : ''
                  }`}
                >
                  <span
                    className={`tabular-nums font-bold ${
                      i === 0 ? 'text-amber-300' : i < 3 ? 'text-white/80' : 'text-white/30'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="truncate text-white/70">
                    {e.display_name ? (
                      <span className="text-white">{e.display_name}</span>
                    ) : (
                      <span>{shortWallet(e.wallet_address)}</span>
                    )}
                    {isMe && <span className="ml-2 text-[10px] text-amber-300">YOU</span>}
                  </span>
                  {secondary !== null && (
                    <span className="text-right text-xs text-white/50 tabular-nums">
                      {fmtS(secondary)}
                    </span>
                  )}
                  <span
                    className={`text-right font-bold tabular-nums ${
                      i === 0 ? 'text-amber-300' : 'text-white'
                    }`}
                  >
                    {fmtP(primary)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function defaultFormat(v: number): string {
  return v.toLocaleString();
}

function shortWallet(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}
