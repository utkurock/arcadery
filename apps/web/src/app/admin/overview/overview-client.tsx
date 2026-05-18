'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  Activity,
  Coins,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OverviewData } from '@/lib/admin/aggregate';

interface Props {
  data: OverviewData;
}

type RangeKey = '7d' | '30d';

// /admin/overview interactive client. The dashboard takes the server-fetched
// `data` as initial value, then:
//   * the "Refresh" button triggers a route refresh (re-runs the aggregator)
//   * the range toggle filters the daily series client-side (no extra fetch)
// All chart libs are recharts; styling follows the dark admin palette.

export function OverviewClient({ data }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [range, setRange] = useState<RangeKey>('30d');

  const sliced =
    range === '7d' ? data.daily.slice(data.daily.length - 7) : data.daily;
  const rangePlays = sliced.reduce((sum, d) => sum + d.plays, 0);
  const rangeRevenue = sliced.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <div className="px-6 py-6 lg:px-10 lg:py-8 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-xs font-mono text-white/40 mt-1">
            Updated {fmtRelative(data.generatedAt)} ·{' '}
            {data.truncated ? (
              <span className="text-amber-300">
                truncated (one or more games over 5k rows in 30d)
              </span>
            ) : (
              <span>full window</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1 text-xs font-mono">
            {(['7d', '30d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-full px-3 py-1 transition-colors ${
                  range === r
                    ? 'bg-white text-stone-900'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            onClick={() => startTransition(() => router.refresh())}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-mono hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>
      </header>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Total plays"
          value={data.totalPlays.toLocaleString()}
          sub={`${rangePlays.toLocaleString()} in ${range}`}
          tint="from-cyan-400/20 to-cyan-400/5"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Revenue"
          value={`${data.totalRevenueSol.toLocaleString(undefined, {
            maximumFractionDigits: 3,
          })} SOL`}
          sub={`${rangeRevenue.toLocaleString(undefined, {
            maximumFractionDigits: 3,
          })} SOL in ${range}`}
          tint="from-emerald-400/20 to-emerald-400/5"
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Active wallets · 30d"
          value={data.activeWallets30d.toLocaleString()}
          sub={`${data.totalPaidPlays.toLocaleString()} paid plays lifetime`}
          tint="from-violet-400/20 to-violet-400/5"
        />
        <StatCard
          icon={<Coins className="h-4 w-4" />}
          label="Tokenized games"
          value={data.tokenizedGames.toLocaleString()}
          sub={`Supply · ${formatSupply(data.totalTokenSupply)}`}
          tint="from-amber-400/20 to-amber-400/5"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 mb-6">
        <Panel className="xl:col-span-3" title="Plays · daily">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sliced} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="playsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.45)' }}
                  tickFormatter={fmtShortDate}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                  minTickGap={32}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.45)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                  width={40}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="plays"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  fill="url(#playsGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="xl:col-span-2" title="Revenue · daily (SOL)">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sliced} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.45)' }}
                  tickFormatter={fmtShortDate}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                  minTickGap={32}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.45)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                  width={40}
                />
                <Tooltip content={<ChartTooltip currency="SOL" />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#34d399"
                  strokeWidth={2}
                  fill="url(#revGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Plays · by game">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.perGame}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.45)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.7)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                  width={104}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="plays" radius={[0, 6, 6, 0]}>
                  {data.perGame.map((g) => (
                    <Cell key={g.key} fill={g.color} />
                  ))}
                </Bar>
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Per-game breakdown">
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-mono">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-white/40">
                  <th className="py-2 pr-3 text-left font-normal">Game</th>
                  <th className="py-2 px-3 text-right font-normal">Plays</th>
                  <th className="py-2 px-3 text-right font-normal">Paid</th>
                  <th className="py-2 px-3 text-right font-normal">Revenue (SOL)</th>
                  <th className="py-2 pl-3 text-right font-normal">Last play</th>
                </tr>
              </thead>
              <tbody>
                {data.perGame.map((g) => (
                  <tr
                    key={g.key}
                    className="border-t border-white/[0.06] hover:bg-white/[0.02]"
                  >
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: g.color }}
                        />
                        <span className="text-white">{g.label}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right text-white tabular-nums">
                      {g.plays.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right text-white/70 tabular-nums">
                      {g.paidPlays.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-300 tabular-nums">
                      {g.revenueSol.toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                    </td>
                    <td className="py-2.5 pl-3 text-right text-white/50">
                      {g.lastPlayAt ? fmtRelative(g.lastPlayAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tint: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${tint} px-4 py-4`}
    >
      <div className="absolute inset-0 bg-[#0a0c12]/85" />
      <div className="relative">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40 font-mono">
          {icon}
          {label}
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
        <div className="mt-1 text-[11px] font-mono text-white/50">{sub}</div>
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-[#0a0c12] px-4 py-4 ${className ?? ''}`}
    >
      <h2 className="text-xs uppercase tracking-widest text-white/40 font-mono mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

interface TooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  currency?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#0a0c12]/95 px-3 py-2 text-xs font-mono shadow-2xl">
      {label && (
        <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">
          {fmtLongDate(label)}
        </div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color }}
          />
          <span className="text-white/70">{p.name ?? p.dataKey}</span>
          <span className="ml-auto text-white tabular-nums">
            {typeof p.value === 'number'
              ? p.value.toLocaleString(undefined, {
                  maximumFractionDigits: 3,
                })
              : p.value}
            {currency ? ` ${currency}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Format helpers ────────────────────────────────────────────────────

function fmtShortDate(iso: string): string {
  // "2026-05-19" → "May 19"
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function fmtLongDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function fmtRelative(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = now - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const d = Math.floor(diff / 86_400_000);
  return `${d}d ago`;
}

function formatSupply(n: number): string {
  if (n === 0) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}
