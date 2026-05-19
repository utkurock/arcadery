'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowLeft,
  Coins,
  Crosshair,
  Castle,
  Sword,
  Puzzle,
  Wind,
  Layers,
  Box,
  Gamepad2,
  Sparkles,
  Car,
  Play,
  ExternalLink,
  Copy,
  Check,
  Radio,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import type { LiveToken } from '@/lib/tokens/devnet-loader';

// Wallet-driven swap UI lives behind a dynamic import — `useWallet` only
// works in the browser and pulls in a large bundle we don't need on first paint.
const SwapTokenModal = dynamic(
  () => import('@/components/tokens/swap-token-modal').then((m) => m.SwapTokenModal),
  { ssr: false },
);

interface CategoryMeta {
  icon: LucideIcon;
  gradient: string;
  accent: string;
  ring: string;
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  platformer: {
    icon: Gamepad2,
    gradient: 'from-emerald-500/30 via-emerald-700/15 to-emerald-900/40',
    accent: 'text-emerald-300',
    ring: 'ring-emerald-400/40',
  },
  shooter: {
    icon: Crosshair,
    gradient: 'from-rose-500/30 via-rose-700/15 to-rose-900/40',
    accent: 'text-rose-300',
    ring: 'ring-rose-400/40',
  },
  strategy: {
    icon: Castle,
    gradient: 'from-amber-500/30 via-amber-700/15 to-amber-900/40',
    accent: 'text-amber-300',
    ring: 'ring-amber-400/40',
  },
  card: {
    icon: Sword,
    gradient: 'from-violet-500/30 via-violet-700/15 to-violet-900/40',
    accent: 'text-violet-300',
    ring: 'ring-violet-400/40',
  },
  puzzle: {
    icon: Puzzle,
    gradient: 'from-sky-500/30 via-sky-700/15 to-sky-900/40',
    accent: 'text-sky-300',
    ring: 'ring-sky-400/40',
  },
  runner: {
    icon: Wind,
    gradient: 'from-cyan-500/30 via-cyan-700/15 to-cyan-900/40',
    accent: 'text-cyan-300',
    ring: 'ring-cyan-400/40',
  },
  showcase: {
    icon: Box,
    gradient: 'from-fuchsia-500/30 via-fuchsia-700/15 to-indigo-900/40',
    accent: 'text-fuchsia-300',
    ring: 'ring-fuchsia-400/40',
  },
  racing: {
    icon: Car,
    gradient: 'from-orange-500/30 via-rose-700/15 to-fuchsia-900/40',
    accent: 'text-orange-300',
    ring: 'ring-orange-400/40',
  },
  starter: {
    icon: Sparkles,
    gradient: 'from-[#8b7ec8]/35 via-[#6b5fa8]/20 to-[#3b2f78]/45',
    accent: 'text-[#c0b6ed]',
    ring: 'ring-[#8b7ec8]/40',
  },
  general: {
    icon: Layers,
    gradient: 'from-slate-500/30 via-slate-700/15 to-slate-900/40',
    accent: 'text-slate-300',
    ring: 'ring-slate-400/40',
  },
};

function metaFor(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? CATEGORY_META.general;
}

export function TokenDetailClient({ token }: { token: LiveToken }) {
  const meta = metaFor(token.category);
  const Icon = meta.icon;
  const [swapOpen, setSwapOpen] = useState(false);
  // The swap modal types `cluster` as 'mainnet' | 'devnet'; map whatever the
  // registry has ("mainnet-beta", "devnet", "testnet") into that shape.
  const modalCluster = token.cluster === 'mainnet-beta' ? 'mainnet' : 'devnet';
  // Meteora launchpad page for the token — used as the swap modal's fallback
  // when the bonding-curve pool has migrated to DAMM V2.
  const meteoraUrl = `https://launch.meteora.ag/token/${token.mint}${
    modalCluster === 'devnet' ? '?cluster=devnet' : ''
  }`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-8 lg:px-10">
      <Link
        href="/tokens"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-white/40 transition-colors hover:text-white/80"
      >
        <ArrowLeft size={12} />
        Back to tokens
      </Link>

      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <div
        className={`relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br ${meta.gradient} p-6 md:p-8`}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-black/30 ring-1 ${meta.ring} backdrop-blur`}
            >
              <Icon className={`h-6 w-6 ${meta.accent}`} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  ${token.symbol}
                </h1>
                <span className={`text-base font-medium ${meta.accent}/90`}>
                  {token.name}
                </span>
                {token.alive ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                    <Radio size={9} />
                    Live
                  </span>
                ) : (
                  <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-300">
                    Offline
                  </span>
                )}
                <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/60 backdrop-blur">
                  {token.cluster}
                </span>
              </div>
              {token.description && (
                <p className="mt-1.5 max-w-xl text-sm text-white/60">
                  {token.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSwapOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#fbbf24] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#f59e0b]"
            >
              <Coins size={14} />
              Buy / Sell
            </button>
            <Link
              href={token.playHref}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/85"
            >
              <Play size={14} className="fill-current" />
              Play game
            </Link>
          </div>
        </div>

        {/* ─── Stats row ──────────────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <StatCard
            label="Price"
            value={formatPriceUsd(token.priceUsd)}
            sub={`${formatPriceSol(token.priceSol)} SOL`}
            mono
          />
          <StatCard
            label="Liquidity"
            value={`${token.liquiditySol.toFixed(3)} SOL`}
            sub={
              token.liquiditySol === 0 && token.alive
                ? 'awaiting first swap'
                : 'in bonding curve'
            }
          />
          <StatCard
            label="Curve progress"
            value={`${(token.curveProgress * 100).toFixed(1)}%`}
            sub="to DAMM V2 migration"
          />
          <StatCard
            label="Network"
            value={token.cluster.toUpperCase()}
            sub="Meteora DBC"
          />
        </div>

        {/* Curve progress bar — bigger visual cue toward the 80-SOL migration. */}
        <div className="mt-6">
          <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-wider text-white/40">
            <span>Migration progress</span>
            <span>
              {token.liquiditySol.toFixed(2)} / 80 SOL ·{' '}
              {(token.curveProgress * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#ef4444] transition-all"
              style={{ width: `${Math.min(100, token.curveProgress * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* ─── Chart ────────────────────────────────────────────────────── */}
      <section className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white/80">
            <TrendingUp size={14} className="text-[#fbbf24]" />
            Price history
          </h2>
          <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300/90">
            Placeholder · pre-trade
          </span>
        </div>
        <BigSparkline points={token.sparkline} />
        <p className="mt-3 text-[11px] text-white/40">
          Devnet bonding-curve tokens have no indexed history. The chart fills in
          once swaps begin and we start snapshotting on-chain price.
        </p>
      </section>

      {/* ─── Pool info + Game preview ─────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="mb-3 text-sm font-semibold text-white/80">On-chain</h2>
          <dl className="space-y-2">
            <PoolRow
              label="Base mint"
              value={token.mint}
              href={token.explorerUrl}
            />
            <PoolRow
              label="DBC pool"
              value={token.poolAddress}
              href={token.explorerPoolUrl}
            />
            <PoolRow
              label="Config"
              value={token.configAddress}
              href={`https://solscan.io/address/${token.configAddress}?cluster=${token.cluster}`}
            />
            <PoolRow
              label="Deploy tx"
              value={token.deployTx}
              href={`https://solscan.io/tx/${token.deployTx}?cluster=${token.cluster}`}
            />
            <PoolRow label="Launched" value={formatRelative(token.launchedAt)} />
          </dl>
        </section>

        <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="mb-3 text-sm font-semibold text-white/80">Game</h2>
          <Link
            href={token.playHref}
            className={`group block overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br ${meta.gradient} p-6 transition-all hover:border-white/20`}
          >
            <div className="flex aspect-[16/9] items-center justify-center">
              <Icon
                className={`h-12 w-12 ${meta.accent} opacity-80 transition-transform group-hover:scale-110`}
              />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {token.name}
                </p>
                <p className={`text-[11px] ${meta.accent}/80`}>
                  $ {token.symbol} · {token.category}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md bg-white text-black px-3 py-1.5 text-[11px] font-semibold">
                <Play size={11} className="fill-current" />
                Play
              </span>
            </div>
          </Link>
        </section>
      </div>

      {swapOpen && (
        <SwapTokenModal
          open={swapOpen}
          onClose={() => setSwapOpen(false)}
          tokenMint={token.mint}
          ticker={token.symbol}
          cluster={modalCluster}
          meteoraFallbackUrl={meteoraUrl}
        />
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  mono,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3 backdrop-blur">
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p
        className={`mt-0.5 text-lg font-semibold text-white ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-white/40">{sub}</p>}
    </div>
  );
}

function PoolRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  const looksLikeAddress = value.length > 32;
  const display = looksLikeAddress ? `${value.slice(0, 6)}…${value.slice(-6)}` : value;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.04] py-2 last:border-b-0">
      <dt className="text-xs text-white/40">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="truncate font-mono text-xs text-white/85 hover:text-white"
            title={value}
          >
            {display}
          </a>
        ) : (
          <span className="truncate font-mono text-xs text-white/85" title={value}>
            {display}
          </span>
        )}
        {looksLikeAddress && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy"
            className="rounded p-1 text-white/40 hover:bg-white/[0.06] hover:text-white/80"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
          </button>
        )}
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label="Open in explorer"
            className="rounded p-1 text-white/40 hover:bg-white/[0.06] hover:text-white/80"
          >
            <ExternalLink size={11} />
          </a>
        )}
      </dd>
    </div>
  );
}

function BigSparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 720;
  const height = 160;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 10) - 5;
    return [x, y] as const;
  });
  const polyline = coords
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
  const areaPath =
    `M ${coords[0][0]},${height} ` +
    `L ${coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ')} ` +
    `L ${coords[coords.length - 1][0]},${height} Z`;
  const up = points[points.length - 1] >= points[0];
  const stroke = up ? '#34d399' : '#f87171';
  const fill = up ? '#34d39922' : '#f8717122';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-40 w-full"
      aria-hidden="true"
    >
      {/* Faint horizontal guides */}
      {[0.25, 0.5, 0.75].map((p) => (
        <line
          key={p}
          x1={0}
          x2={width}
          y1={height * p}
          y2={height * p}
          stroke="#ffffff10"
          strokeDasharray="3 4"
          strokeWidth={1}
        />
      ))}
      <path d={areaPath} fill={fill} stroke="none" />
      <polyline
        points={polyline}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Plain-decimal price formatter (no scientific notation). Tiny values trim
// trailing zeros so "0.00000180" → "0.0000018".
function formatPriceUsd(p: number): string {
  if (!p || !isFinite(p)) return '—';
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
  if (!s.includes('.')) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return 'just now';
  if (diff < hour) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
}
