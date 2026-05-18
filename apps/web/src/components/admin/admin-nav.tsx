'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, BarChart3, Coins, ShieldCheck } from 'lucide-react';

// Sidebar for the admin section. Server component would also work, but we
// want active-link styling and that needs `usePathname()` which is
// client-only. Tiny, no real state — fine to render client-side.

interface Props {
  wallet: string;
}

export function AdminNav({ wallet }: Props) {
  const pathname = usePathname();
  const items = [
    { href: '/admin/overview', label: 'Overview', icon: BarChart3 },
    { href: '/admin/tokens', label: 'Tokens', icon: Coins },
  ];
  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-white/10 bg-[#0a0c12] px-4 py-6">
      <Link
        href="/explore"
        className="inline-flex items-center gap-1.5 mb-6 text-xs font-mono text-white/50 hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to app
      </Link>
      <div className="mb-2 flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2">
        <ShieldCheck className="h-4 w-4 text-emerald-300" />
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] uppercase tracking-widest text-emerald-300/70 font-mono">
            Admin
          </span>
          <span className="text-[11px] font-mono text-emerald-100 truncate">
            {shorten(wallet)}
          </span>
        </div>
      </div>
      <nav className="mt-4 flex flex-col gap-1">
        {items.map((it) => {
          const Icon = it.icon;
          const active =
            pathname === it.href || pathname?.startsWith(it.href + '/');
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-mono transition-colors ${
                active
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto text-[10px] font-mono text-white/30 leading-relaxed">
        arcadery admin · v1
      </div>
    </aside>
  );
}

function shorten(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}
