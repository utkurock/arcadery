'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Compass,
  FolderOpen,
  LayoutTemplate,
  DollarSign,
  Settings,
  Coins,
  Gem,
  Plus,
  Menu,
  X,
  Wallet,
  User,
} from 'lucide-react';
import { useModals } from '@/lib/ui/modals';
import { useViewer, truncateAddress } from '@/lib/auth/use-viewer';
import { Avatar } from '@/components/ui/avatar';
import { useScrollLock } from '@/lib/ui/use-scroll-lock';

const DisconnectButton = dynamic(
  () => import('@/components/auth/disconnect-button').then((m) => m.DisconnectButton),
  { ssr: false },
);

const mainNav = [
  { href: '/explore', label: 'Explore', icon: Compass },
  { href: '/projects', label: 'My Games', icon: FolderOpen },
  { href: '/templates', label: 'Templates', icon: LayoutTemplate },
  { href: '/tokens', label: 'Tokens', icon: Coins },
];

// Profile slots in via useMemo below — href is dynamic (depends on viewer.userId)
// so we can't include it in the static array.
// Credits uses the Gem icon so the Coins glyph stays unique to /tokens.
const baseBottomNav = [
  { href: '/credits', label: 'Credits', icon: Gem },
  { href: '/earnings', label: 'Earnings', icon: DollarSign },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const viewer = useViewer();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Profile entry shows first in bottomNav, but only when signed in (otherwise
  // we'd link to /profile/null which 404s). Active when on /profile/* of self.
  const bottomNav = useMemo(() => {
    if (viewer.status !== 'signed-in') return baseBottomNav;
    return [
      { href: `/profile/${viewer.userId}`, label: 'Profile', icon: User },
      ...baseBottomNav,
    ];
  }, [viewer]);

  // Close drawer when route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll only when the drawer is the modal-style overlay.
  useScrollLock(mobileOpen);

  const isSignedIn = viewer.status === 'signed-in';
  const displayName = isSignedIn ? viewer.displayName : null;
  const walletAddress = isSignedIn ? viewer.walletAddress : null;
  const avatarUrl = isSignedIn ? viewer.avatarUrl : null;
  const label =
    displayName || (walletAddress ? truncateAddress(walletAddress) : null);
  const avatarFallback = displayName || walletAddress || '?';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0a0a0f] text-white font-[family-name:var(--font-inter)] md:flex-row">
      {/* Mobile top bar — visible below md only. */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0a0a0f] px-4 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          aria-controls="dashboard-sidebar"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/[0.06] hover:text-white"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link
          href="/"
          className="text-lg font-bold text-white"
          style={{ fontFamily: 'var(--font-vintage), serif' }}
        >
          arc
        </Link>
        {isSignedIn ? (
          <Link
            href="/create/new"
            aria-label="Create game"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#8b7ec8] text-white hover:bg-[#7a6db8]"
          >
            <Plus className="h-4 w-4" />
          </Link>
        ) : (
          <button
            type="button"
            aria-label="Sign in to create a game"
            onClick={() => useModals.getState().openLogin()}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#8b7ec8] text-white hover:bg-[#7a6db8]"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </header>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="dashboard-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-white/[0.06] bg-[#0a0a0f] transition-transform md:static md:z-auto md:w-56 md:translate-x-0 lg:w-60 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Primary"
      >
        <div className="flex h-14 items-center justify-between border-b border-white/[0.04] px-5">
          <Link
            href="/"
            className="text-lg font-bold text-white"
            style={{ fontFamily: 'var(--font-vintage), serif' }}
          >
            arc
          </Link>
          {/* Close button visible only inside the drawer (mobile). */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isSignedIn ? (
          <div className="mx-3 mt-4 mb-2 flex items-center gap-2.5 rounded-lg bg-white/[0.03] px-2 py-2">
            <Avatar src={avatarUrl} fallback={avatarFallback} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white/80">
                {label ?? 'Signed in'}
              </p>
              <p className="text-[10px] text-white/30">Free plan</p>
            </div>
          </div>
        ) : (
          <div className="mx-3 mt-4 mb-2">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                useModals.getState().openLogin();
              }}
              className="group flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] py-2.5 text-xs font-semibold text-white/75 transition-colors hover:border-[#8b7ec8]/40 hover:bg-[#8b7ec8]/[0.08] hover:text-white"
            >
              <Wallet className="h-3.5 w-3.5 text-[#a99ad4] transition-colors group-hover:text-[#c4b8e6]" />
              Connect wallet
            </button>
          </div>
        )}

        <div className="px-3 mb-3">
          {isSignedIn ? (
            <Link
              href="/create/new"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#8b7ec8] py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#7a6db8]"
            >
              <Plus className="h-3.5 w-3.5" />
              Create
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                useModals.getState().openLogin();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#8b7ec8] py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#7a6db8]"
            >
              <Plus className="h-3.5 w-3.5" />
              Create
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2">
          {mainNav.map(({ href, label: navLabel, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? 'bg-[#8b7ec8]/[0.12] text-[#a99ad4]'
                    : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70'
                }`}
              >
                <Icon className="h-4 w-4" />
                {navLabel}
              </Link>
            );
          })}

          <div className="my-2 h-px bg-white/[0.04]" />

          {bottomNav.map(({ href, label: navLabel, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? 'bg-[#8b7ec8]/[0.12] text-[#a99ad4]'
                    : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70'
                }`}
              >
                <Icon className="h-4 w-4" />
                {navLabel}
              </Link>
            );
          })}
        </nav>

        {isSignedIn && (
          <div className="px-2 pb-3">
            <DisconnectButton />
          </div>
        )}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
