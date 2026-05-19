'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Coins,
  Sparkles,
  Crosshair,
  Castle,
  Sword,
  Puzzle,
  Wind,
  Layers,
  Box,
  Gamepad2,
  Radio,
  Car,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';
import type { LiveToken } from '@/lib/tokens/devnet-loader';
import { ChatTrigger } from '@/components/chat/chat-trigger';

interface CategoryMeta {
  icon: LucideIcon;
  /** Solid tint used for the avatar circle. */
  tint: string;
  /** Soft glow under the avatar — same hue, very low alpha. */
  glow: string;
  accent: string;
}

// The site uses understated dark cards across templates/explore. Categories
// give just an avatar tint, not a whole-card gradient.
const CATEGORY_META: Record<string, CategoryMeta> = {
  platformer: {
    icon: Gamepad2,
    tint: 'bg-emerald-500/20',
    glow: 'shadow-[0_0_24px_-12px_rgba(16,185,129,0.4)]',
    accent: 'text-emerald-300',
  },
  shooter: {
    icon: Crosshair,
    tint: 'bg-rose-500/20',
    glow: 'shadow-[0_0_24px_-12px_rgba(244,63,94,0.4)]',
    accent: 'text-rose-300',
  },
  strategy: {
    icon: Castle,
    tint: 'bg-amber-500/20',
    glow: 'shadow-[0_0_24px_-12px_rgba(251,191,36,0.4)]',
    accent: 'text-amber-300',
  },
  card: {
    icon: Sword,
    tint: 'bg-violet-500/20',
    glow: 'shadow-[0_0_24px_-12px_rgba(139,92,246,0.4)]',
    accent: 'text-violet-300',
  },
  puzzle: {
    icon: Puzzle,
    tint: 'bg-sky-500/20',
    glow: 'shadow-[0_0_24px_-12px_rgba(56,189,248,0.4)]',
    accent: 'text-sky-300',
  },
  runner: {
    icon: Wind,
    tint: 'bg-cyan-500/20',
    glow: 'shadow-[0_0_24px_-12px_rgba(34,211,238,0.4)]',
    accent: 'text-cyan-300',
  },
  showcase: {
    icon: Box,
    tint: 'bg-fuchsia-500/20',
    glow: 'shadow-[0_0_24px_-12px_rgba(217,70,239,0.4)]',
    accent: 'text-fuchsia-300',
  },
  racing: {
    icon: Car,
    tint: 'bg-orange-500/20',
    glow: 'shadow-[0_0_24px_-12px_rgba(249,115,22,0.4)]',
    accent: 'text-orange-300',
  },
  starter: {
    icon: Sparkles,
    tint: 'bg-[#8b7ec8]/25',
    glow: 'shadow-[0_0_24px_-12px_rgba(139,126,200,0.4)]',
    accent: 'text-[#c0b6ed]',
  },
  general: {
    icon: Layers,
    tint: 'bg-slate-500/20',
    glow: 'shadow-[0_0_24px_-12px_rgba(100,116,139,0.4)]',
    accent: 'text-slate-300',
  },
};

function metaFor(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? CATEGORY_META.general;
}

export function TokensClient({ liveTokens }: { liveTokens: LiveToken[] }) {
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return liveTokens;
    return liveTokens.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.symbol.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [liveTokens, q]);

  return (
    // Matches /explore layout: full-width flex column, sticky header, scroll
    // body — drops the previous max-w-7xl cap so the token grid breathes on
    // wide monitors the same way Explore cards do.
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-white/[0.06] px-4 pt-5 pb-4 sm:px-6 md:px-8 lg:px-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-white">Game Tokens</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                <Radio size={9} />
                Live · devnet
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/30">
              Every game mints its own SPL token through a Meteora bonding curve.
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tokens..."
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-8 pr-3 text-xs text-white/80 placeholder:text-white/25 outline-none transition-colors focus:border-[#8b7ec8]/40"
              />
            </div>
            <ChatTrigger />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        {liveTokens.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <p className="mt-12 text-center text-xs text-white/30">
            No tokens match &quot;{search}&quot;.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((t) => (
              <LiveTokenCard key={t.mint} token={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LiveTokenCard({ token }: { token: LiveToken }) {
  const meta = metaFor(token.category);
  const Icon = meta.icon;
  const up =
    token.sparkline.length >= 2 &&
    token.sparkline[token.sparkline.length - 1] >= token.sparkline[0];

  return (
    <Link
      href={`/tokens/${token.slug}`}
      className="group block overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] transition-all hover:border-white/15 hover:bg-white/[0.04]"
    >
      {/* Header: avatar + symbol/name + status pills */}
      <div className="flex items-start gap-3 p-4 pb-2">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.tint} ${meta.glow}`}
        >
          <Icon className={`h-4 w-4 ${meta.accent}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-white">${token.symbol}</span>
            {token.alive ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
                <span className="h-1 w-1 rounded-full bg-emerald-400" />
                Live
              </span>
            ) : (
              <span className="rounded-full bg-rose-500/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-rose-300">
                Offline
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-white/50">{token.name}</p>
        </div>
        <ArrowUpRight
          size={14}
          className="shrink-0 text-white/20 transition-colors group-hover:text-white/60"
        />
      </div>

      {/* Sparkline band — subtle, ambient, full width */}
      <div className="px-2">
        <Sparkline points={token.sparkline} up={up} />
      </div>

      {/* Numeric facts */}
      <div className="grid grid-cols-2 gap-2 px-4 pb-3 pt-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/30">Price</p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-white">
            {formatPriceUsd(token.priceUsd)}
          </p>
          <p className="font-mono text-[10px] text-white/30">
            {formatPriceSol(token.priceSol)} SOL
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-white/30">
            Liquidity
          </p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-white">
            {token.liquiditySol.toFixed(2)}{' '}
            <span className="text-[11px] font-normal text-white/40">SOL</span>
          </p>
          <p className="text-[10px] text-white/30">
            {(token.curveProgress * 100).toFixed(1)}% to migration
          </p>
        </div>
      </div>

      {/* Migration progress bar — thin */}
      <div className="px-4 pb-4">
        <div className="h-1 overflow-hidden rounded-full bg-white/[0.04]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#ef4444]"
            style={{ width: `${Math.min(100, token.curveProgress * 100)}%` }}
          />
        </div>
      </div>

      {/* Footer chip */}
      <div className="flex items-center justify-between border-t border-white/[0.04] bg-white/[0.01] px-4 py-2.5 text-[11px]">
        <span className={`uppercase tracking-wider ${meta.accent}/80`}>
          {token.category}
        </span>
        <span className="text-white/40 transition-colors group-hover:text-white/80">
          {token.cluster} · view →
        </span>
      </div>
    </Link>
  );
}

function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 200;
  const height = 38;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 4) - 2;
    return [x, y] as const;
  });
  const polyline = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath =
    `M ${coords[0][0]},${height} ` +
    `L ${coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ')} ` +
    `L ${coords[coords.length - 1][0]},${height} Z`;
  const stroke = up ? '#34d399' : '#f87171';
  const fill = up ? 'rgba(52,211,153,0.10)' : 'rgba(248,113,113,0.10)';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-10 w-full"
      aria-hidden="true"
    >
      <path d={areaPath} fill={fill} stroke="none" />
      <polyline
        points={polyline}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-white/40">
      <Coins className="mb-3 h-10 w-10 opacity-40" />
      <p className="text-sm font-medium">No tokens minted yet.</p>
      <p className="mt-1 max-w-md text-center text-xs text-white/30">
        Launch one with{' '}
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-white/60">
          pnpm tsx scripts/launch-game-token.ts
        </code>
        .
      </p>
    </div>
  );
}

// ─── Number formatters ────────────────────────────────────────────────────
// User-facing prices show as plain decimals (no scientific notation). For
// very small values we cap fractional precision and trim trailing zeros so
// "$0.00000180000" reads as "$0.0000018".

function formatPriceUsd(p: number): string {
  if (!p || !isFinite(p)) return '$0';
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${trimZeros(p.toFixed(4))}`;
  if (p >= 0.0001) return `$${trimZeros(p.toFixed(6))}`;
  return `$${trimZeros(p.toFixed(10))}`;
}

function formatPriceSol(p: number): string {
  if (!p || !isFinite(p)) return '0';
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.0001) return trimZeros(p.toFixed(6));
  return trimZeros(p.toFixed(10));
}

function trimZeros(s: string): string {
  // "0.00000180" → "0.0000018", but keep at least "0.00" for typical decimals.
  if (!s.includes('.')) return s;
  const trimmed = s.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed;
}
