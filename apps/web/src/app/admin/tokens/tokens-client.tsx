'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownUp,
  Coins,
  Copy,
  ExternalLink,
  RefreshCw,
  Search,
} from 'lucide-react';
import type { AdminTokenRow } from '@/lib/admin/tokens';

// Tokens table — searchable, sortable, with quick copy-to-clipboard on the
// mint address. Reads all rows up-front (capped server-side at 500) and does
// filtering client-side for snappy UX.

interface Props {
  rows: AdminTokenRow[];
}

type SortKey = 'launched' | 'supply' | 'name';

export function TokensClient({ rows }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('launched');

  const filtered = useMemo(() => {
    const norm = q.trim().toLowerCase();
    const list = norm
      ? rows.filter(
          (r) =>
            (r.token_name && r.token_name.toLowerCase().includes(norm)) ||
            (r.token_symbol && r.token_symbol.toLowerCase().includes(norm)) ||
            (r.name && r.name.toLowerCase().includes(norm)) ||
            (r.token_mint && r.token_mint.toLowerCase().includes(norm)) ||
            (r.token_creator_wallet &&
              r.token_creator_wallet.toLowerCase().includes(norm)),
        )
      : rows.slice();
    list.sort((a, b) => {
      if (sort === 'supply') {
        return Number(b.token_supply ?? 0) - Number(a.token_supply ?? 0);
      }
      if (sort === 'name') {
        return (a.token_name || a.name || '').localeCompare(
          b.token_name || b.name || '',
        );
      }
      // 'launched' default
      const ta = a.token_launched_at ? Date.parse(a.token_launched_at) : 0;
      const tb = b.token_launched_at ? Date.parse(b.token_launched_at) : 0;
      return tb - ta;
    });
    return list;
  }, [rows, q, sort]);

  // Aggregate header stats from the same dataset so the panel is
  // self-contained even if the user navigates directly here.
  const summary = useMemo(() => {
    let supply = 0;
    let withImg = 0;
    for (const r of rows) {
      if (r.token_supply) supply += Number(r.token_supply);
      if (r.token_image_url) withImg += 1;
    }
    return { supply, count: rows.length, withImg };
  }, [rows]);

  return (
    <div className="px-6 py-6 lg:px-10 lg:py-8 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Tokens</h1>
          <p className="text-xs font-mono text-white/40 mt-1">
            All Meteora DBC launches from published games · {summary.count} total ·{' '}
            {summary.withImg} with cover image
          </p>
        </div>
        <button
          onClick={() => startTransition(() => router.refresh())}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-mono hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat icon={<Coins className="h-4 w-4" />} label="Launches" value={summary.count.toLocaleString()} />
        <Stat label="Total supply" value={formatSupply(summary.supply)} />
        <Stat label="With cover art" value={`${summary.withImg}/${summary.count}`} />
        <Stat label="Showing" value={filtered.length.toLocaleString()} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative grow max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, symbol, mint, creator…"
            className="w-full rounded-full bg-white/[0.04] border border-white/10 pl-9 pr-3 py-2 text-xs font-mono text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
          />
        </div>
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1 text-xs font-mono">
          {(
            [
              { k: 'launched', label: 'Newest' },
              { k: 'supply', label: 'Supply' },
              { k: 'name', label: 'A–Z' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.k}
              onClick={() => setSort(opt.k)}
              className={`rounded-full px-3 py-1 transition-colors flex items-center gap-1 ${
                sort === opt.k
                  ? 'bg-white text-stone-900'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {opt.k === sort && <ArrowDownUp className="h-3 w-3" />}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/10 bg-[#0a0c12] overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState query={q} hasAny={rows.length > 0} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-[10px] uppercase tracking-widest text-white/40 font-mono">
                <tr>
                  <th className="text-left py-3 px-4 font-normal">Token</th>
                  <th className="text-left py-3 px-4 font-normal">Mint</th>
                  <th className="text-right py-3 px-4 font-normal">Supply</th>
                  <th className="text-left py-3 px-4 font-normal">Creator</th>
                  <th className="text-left py-3 px-4 font-normal">Launched</th>
                  <th className="text-right py-3 px-4 font-normal">Open</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {filtered.map((r) => (
                  <TokenRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TokenRow({ row }: { row: AdminTokenRow }) {
  return (
    <tr className="border-t border-white/[0.05] hover:bg-white/[0.02]">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3 min-w-0">
          {row.token_image_url ? (
            <Image
              src={row.token_image_url}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-md object-cover bg-white/5 shrink-0"
              unoptimized
            />
          ) : (
            <div className="h-9 w-9 rounded-md bg-gradient-to-br from-amber-400/30 to-violet-500/30 shrink-0 flex items-center justify-center">
              <Coins className="h-4 w-4 text-amber-300/70" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-white text-[13px] truncate font-sans font-semibold">
              {row.token_name || row.name}
            </div>
            <div className="text-[10px] text-white/40 truncate">
              {row.token_symbol ? `$${row.token_symbol}` : row.name}{' '}
              <span className="opacity-50">· {row.creator_name}</span>
            </div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-[11px] text-white/70">
        {row.token_mint ? (
          <span className="inline-flex items-center gap-1">
            <code className="text-white/80">{shorten(row.token_mint, 6)}</code>
            <CopyButton value={row.token_mint} />
          </span>
        ) : (
          <span className="text-white/30">—</span>
        )}
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-white/80 text-[11px]">
        {row.token_supply ? formatSupply(Number(row.token_supply)) : '—'}
      </td>
      <td className="py-3 px-4 text-[11px] text-white/70">
        {row.token_creator_wallet ? (
          <span className="inline-flex items-center gap-1">
            <code className="text-white/80">
              {shorten(row.token_creator_wallet, 4)}
            </code>
            <CopyButton value={row.token_creator_wallet} />
          </span>
        ) : (
          <span className="text-white/30">—</span>
        )}
      </td>
      <td className="py-3 px-4 text-[11px] text-white/70">
        {row.token_launched_at ? fmtRelative(row.token_launched_at) : '—'}
      </td>
      <td className="py-3 px-4 text-right">
        <Link
          href={`/tokens/${row.slug}`}
          className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200"
        >
          <ExternalLink className="h-3 w-3" />
          View
        </Link>
      </td>
    </tr>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex items-center justify-center h-5 w-5 rounded text-white/40 hover:text-white hover:bg-white/10"
      aria-label="Copy"
    >
      {copied ? (
        <span className="text-[9px] text-emerald-300 font-mono">✓</span>
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

function EmptyState({ query, hasAny }: { query: string; hasAny: boolean }) {
  if (!hasAny) {
    return (
      <div className="py-16 text-center text-white/50 font-mono text-sm">
        No tokens launched yet.
      </div>
    );
  }
  return (
    <div className="py-16 text-center text-white/50 font-mono text-sm">
      Nothing matches “{query}”.
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0a0c12] px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40 font-mono">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function shorten(s: string, head = 4): string {
  if (s.length < head * 2 + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-head)}`;
}

function formatSupply(n: number): string {
  if (n === 0) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtRelative(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = now - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const d = Math.floor(diff / 86_400_000);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
