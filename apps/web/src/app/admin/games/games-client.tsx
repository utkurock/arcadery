'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownUp,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Gamepad2,
  RefreshCw,
  Search,
} from 'lucide-react';
import type { AdminGameRow } from '@/lib/admin/published-games';

// Games table — searchable + filterable + sortable list of every published
// game. Mirrors the Tokens panel structure (client-side filtering for snappy
// UX, server provides the full slice) but adds a tokenized/untokenized filter
// since the games dataset is more heterogeneous.

interface Props {
  rows: AdminGameRow[];
}

type SortKey = 'created' | 'views' | 'plays' | 'wallets' | 'name';
type Filter = 'all' | 'tokenized' | 'untokenized';

export function GamesClient({ rows }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('created');
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    const norm = q.trim().toLowerCase();
    let list = rows.slice();
    if (filter === 'tokenized') list = list.filter((r) => r.is_tokenized);
    else if (filter === 'untokenized') list = list.filter((r) => !r.is_tokenized);
    if (norm) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(norm) ||
          r.slug.toLowerCase().includes(norm) ||
          r.creator_name.toLowerCase().includes(norm) ||
          (r.token_name && r.token_name.toLowerCase().includes(norm)) ||
          (r.token_symbol && r.token_symbol.toLowerCase().includes(norm)) ||
          (r.token_mint && r.token_mint.toLowerCase().includes(norm)) ||
          (r.token_creator_wallet &&
            r.token_creator_wallet.toLowerCase().includes(norm)),
      );
    }
    list.sort((a, b) => {
      if (sort === 'views') return b.views30d - a.views30d;
      if (sort === 'plays') return b.plays - a.plays;
      if (sort === 'wallets') return b.uniqueWallets30d - a.uniqueWallets30d;
      if (sort === 'name') return a.name.localeCompare(b.name);
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });
    return list;
  }, [rows, q, sort, filter]);

  const summary = useMemo(() => {
    let tokenized = 0;
    let plays = 0;
    let views = 0;
    let signedIn = 0;
    let walletSum = 0;
    for (const r of rows) {
      if (r.is_tokenized) tokenized += 1;
      plays += r.plays;
      views += r.views30d;
      signedIn += r.signedInViews30d;
      // Cross-game wallet uniqueness can't be reconstructed from per-row
      // counts (a wallet visiting two games would be double-counted). The
      // per-row column shows the precise per-game number; this headline is a
      // sum-of-distincts upper bound, labelled accordingly.
      walletSum += r.uniqueWallets30d;
    }
    return { total: rows.length, tokenized, plays, views, signedIn, walletSum };
  }, [rows]);

  return (
    <div className="px-6 py-6 lg:px-10 lg:py-8 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Games</h1>
          <p className="text-xs font-mono text-white/40 mt-1">
            Every published game · {summary.total} total · {summary.tokenized}{' '}
            tokenized
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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <Stat
          icon={<Gamepad2 className="h-4 w-4" />}
          label="Games"
          value={summary.total.toLocaleString()}
        />
        <Stat label="Tokenized" value={`${summary.tokenized}/${summary.total}`} />
        <Stat label="Views · 30d" value={summary.views.toLocaleString()} />
        <Stat
          label="Signed-in views"
          value={summary.signedIn.toLocaleString()}
          hint={summary.views ? `${Math.round((summary.signedIn / summary.views) * 100)}% of views` : '—'}
        />
        <Stat
          label="Wallet visits"
          value={summary.walletSum.toLocaleString()}
          hint="sum of per-game distinct · 30d"
        />
        <Stat label="Total plays" value={summary.plays.toLocaleString()} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative grow max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, slug, creator, mint…"
            className="w-full rounded-full bg-white/[0.04] border border-white/10 pl-9 pr-3 py-2 text-xs font-mono text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
          />
        </div>

        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1 text-xs font-mono">
          {(
            [
              { k: 'all', label: 'All' },
              { k: 'tokenized', label: 'Tokenized' },
              { k: 'untokenized', label: 'Untokenized' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.k}
              onClick={() => setFilter(opt.k)}
              className={`rounded-full px-3 py-1 transition-colors ${
                filter === opt.k
                  ? 'bg-white text-stone-900'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1 text-xs font-mono">
          {(
            [
              { k: 'created', label: 'Newest' },
              { k: 'views', label: 'Views' },
              { k: 'wallets', label: 'Wallets' },
              { k: 'plays', label: 'Plays' },
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

      <div className="rounded-2xl border border-white/10 bg-[#0a0c12] overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            query={q}
            hasAny={rows.length > 0}
            filtered={filter !== 'all'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-[10px] uppercase tracking-widest text-white/40 font-mono">
                <tr>
                  <th className="text-left py-3 px-4 font-normal">Game</th>
                  <th className="text-left py-3 px-4 font-normal">Creator</th>
                  <th className="text-right py-3 px-4 font-normal" title="View events in the last 30 days (excludes owner)">Views</th>
                  <th className="text-right py-3 px-4 font-normal" title="Views from a signed-in wallet (30d)">Signed-in</th>
                  <th className="text-right py-3 px-4 font-normal" title="Distinct wallets touching this game (30d)">Wallets</th>
                  <th className="text-right py-3 px-4 font-normal" title="Distinct anonymous cookies (30d)">Anons</th>
                  <th className="text-right py-3 px-4 font-normal" title="Lifetime score submissions">Plays</th>
                  <th className="text-left py-3 px-4 font-normal">Token</th>
                  <th className="text-left py-3 px-4 font-normal">Created</th>
                  <th className="text-right py-3 px-4 font-normal">Open</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {filtered.map((r) => (
                  <GameRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function GameRow({ row }: { row: AdminGameRow }) {
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
            <div className="h-9 w-9 rounded-md bg-gradient-to-br from-cyan-400/30 to-violet-500/30 shrink-0 flex items-center justify-center">
              <Gamepad2 className="h-4 w-4 text-cyan-200/70" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-white text-[13px] truncate font-sans font-semibold">
              {row.name}
            </div>
            <div className="text-[10px] text-white/40 truncate inline-flex items-center gap-1">
              <code className="text-white/60">{row.slug}</code>
              <CopyButton value={row.slug} />
              <span className="opacity-50">·</span>
              {row.token_symbol ? `$${row.token_symbol}` : 'no token'}
            </div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-[11px] text-white/70 truncate max-w-[160px]">
        {row.creator_name}
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-white/80 text-[11px]">
        {row.views30d.toLocaleString()}
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-[11px]">
        <span className={row.signedInViews30d > 0 ? 'text-emerald-300/90' : 'text-white/30'}>
          {row.signedInViews30d.toLocaleString()}
        </span>
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-white/80 text-[11px]">
        {row.uniqueWallets30d.toLocaleString()}
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-white/60 text-[11px]">
        {row.uniqueAnons30d.toLocaleString()}
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-white/80 text-[11px]">
        {row.plays.toLocaleString()}
      </td>
      <td className="py-3 px-4 text-[11px]">
        {row.is_tokenized ? (
          <span className="inline-flex items-center gap-1 text-emerald-300/90">
            <CheckCircle2 className="h-3 w-3" />
            {row.token_mint ? (
              <>
                <code className="text-emerald-200/80">
                  {shorten(row.token_mint, 4)}
                </code>
                <CopyButton value={row.token_mint} />
              </>
            ) : (
              'Yes'
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-white/30">
            <Circle className="h-3 w-3" />
            No
          </span>
        )}
      </td>
      <td className="py-3 px-4 text-[11px] text-white/70">
        {fmtRelative(row.created_at)}
      </td>
      <td className="py-3 px-4 text-right">
        <Link
          href={`/play/${row.slug}`}
          target="_blank"
          className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200"
        >
          <ExternalLink className="h-3 w-3" />
          Play
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

function EmptyState({
  query,
  hasAny,
  filtered,
}: {
  query: string;
  hasAny: boolean;
  filtered: boolean;
}) {
  if (!hasAny) {
    return (
      <div className="py-16 text-center text-white/50 font-mono text-sm">
        No games published yet.
      </div>
    );
  }
  if (query) {
    return (
      <div className="py-16 text-center text-white/50 font-mono text-sm">
        Nothing matches “{query}”.
      </div>
    );
  }
  if (filtered) {
    return (
      <div className="py-16 text-center text-white/50 font-mono text-sm">
        No games in this filter.
      </div>
    );
  }
  return null;
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0a0c12] px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40 font-mono">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[9px] text-white/30 font-mono">{hint}</div>}
    </div>
  );
}

function shorten(s: string, head = 4): string {
  if (s.length < head * 2 + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-head)}`;
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
