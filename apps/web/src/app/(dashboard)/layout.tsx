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
  ChevronsLeft,
  ChevronsRight,
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

// Community chat is heavy enough (Supabase realtime client + WS subscription
// lifecycle) that we lazy-load it. Anchored to the dashboard layout so it's
// available on every signed-in page without re-mounting per navigation.
const CommunityChat = dynamic(
  () => import('@/components/chat/community-chat').then((m) => m.CommunityChat),
  { ssr: false },
);

const mainNav = [
  { href: '/explore', label: 'Explore', icon: Compass },
  { href: '/templates', label: 'Templates', icon: LayoutTemplate },
  { href: '/tokens', label: 'Tokens', icon: Coins },
  { href: '/projects', label: 'My Games', icon: FolderOpen },
];

const baseBottomNav = [
  { href: '/credits', label: 'Credits', icon: Gem },
  { href: '/earnings', label: 'Earnings', icon: DollarSign },
  { href: '/settings', label: 'Settings', icon: Settings },
];

// LocalStorage key for the sidebar collapsed-state. Persisted so the user's
// preference survives navigation + reloads.
const COLLAPSED_KEY = 'arcadery:sidebar-collapsed';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const viewer = useViewer();
  const [mobileOpen, setMobileOpen] = useState(false);
  // `collapsed` controls the desktop rail width. Mobile uses the drawer
  // pattern below md and is independent of this flag. Initialize from
  // localStorage so the user's last choice sticks across reloads.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      if (raw === '1') setCollapsed(true);
    } catch {}
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  };

  // Profile entry shows first in bottomNav, but only when signed in (otherwise
  // we'd link to /profile/null which 404s).
  const bottomNav = useMemo(() => {
    if (viewer.status !== 'signed-in') return baseBottomNav;
    return [
      { href: `/profile/${viewer.userId}`, label: 'Profile', icon: User },
      ...baseBottomNav,
    ];
  }, [viewer]);

  // Close mobile drawer when route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll only when the mobile drawer is the modal-style overlay.
  useScrollLock(mobileOpen);

  const isSignedIn = viewer.status === 'signed-in';
  const displayName = isSignedIn ? viewer.displayName : null;
  const walletAddress = isSignedIn ? viewer.walletAddress : null;
  const avatarUrl = isSignedIn ? viewer.avatarUrl : null;
  const label =
    displayName || (walletAddress ? truncateAddress(walletAddress) : null);
  const avatarFallback = displayName || walletAddress || '?';

  // Collapsed-only: hide everything inside the aside except the icon column.
  // Width is animated via transition-[width].
  const asideWidth = collapsed
    ? 'md:w-14 lg:w-14'
    : 'w-64 md:w-56 lg:w-60';

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
          className="text-lg font-bold text-white tracking-wide"
          style={{ fontFamily: 'var(--font-vintage), serif' }}
        >
          arcadery
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
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/[0.06] bg-[#0a0a0f] transition-[width,transform] duration-200 md:static md:z-auto md:translate-x-0 ${asideWidth} ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Primary"
      >
        {/* Top bar.
            • Expanded: single row — [toggle on left] [brand centered] [X
              on mobile right]. Brand is absolute-centered so toggle width
              never offsets it.
            • Collapsed: two stacked rows in a wider header — "AC" mark on
              top, chevron toggle below. Keeps the brand visible in the
              icon rail and gives the chevron a comfortable hit target
              without crowding the rail icons below. */}
        {collapsed ? (
          <div className="flex flex-col items-center gap-1 border-b border-white/[0.04] px-1 py-2">
            <Link
              href="/"
              aria-label="Arcadery home"
              title="Arcadery"
              className="flex h-7 w-9 items-center justify-center rounded-md text-sm font-bold tracking-wide text-white transition-colors hover:bg-white/[0.06]"
              style={{ fontFamily: 'var(--font-vintage), serif' }}
            >
              AC
            </Link>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
              aria-expanded={false}
              title="Expand sidebar"
              className="flex h-7 w-9 items-center justify-center rounded-md text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="relative flex h-16 items-center border-b border-white/[0.04] px-2">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
              aria-expanded={true}
              title="Collapse sidebar"
              className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            {/* Brand styled to match the homepage hero: lowercase, vintage
                serif, tracking-tight, font-bold. Sized with clamp() so the
                lettering scales naturally between md:w-56 and lg:w-60
                without overflowing on the smaller rail. */}
            <Link
              href="/"
              className="absolute left-1/2 -translate-x-1/2 select-none whitespace-nowrap font-bold tracking-tight text-white"
              style={{
                fontFamily: 'var(--font-vintage), serif',
                fontSize: 'clamp(1.5rem, 2.2vw, 1.875rem)',
                lineHeight: 1,
              }}
            >
              arcadery
            </Link>
            {/* Mobile drawer close button — only visible below md. */}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="md:hidden absolute right-3 flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/[0.06] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Profile card / connect prompt */}
        {isSignedIn ? (
          collapsed ? (
            <div className="mt-3 mb-2 flex justify-center">
              <Link
                href={`/profile/${viewer.status === 'signed-in' ? viewer.userId : ''}`}
                title={label ?? 'Profile'}
                aria-label="Profile"
                className="rounded-lg p-1 transition-colors hover:bg-white/[0.04]"
              >
                <Avatar src={avatarUrl} fallback={avatarFallback} size="sm" />
              </Link>
            </div>
          ) : (
            <div className="mx-3 mt-4 mb-2 flex items-center gap-2.5 rounded-lg bg-white/[0.03] px-2 py-2">
              <Avatar src={avatarUrl} fallback={avatarFallback} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white/80">
                  {label ?? 'Signed in'}
                </p>
                <p className="text-[10px] text-white/30">Free plan</p>
              </div>
            </div>
          )
        ) : collapsed ? (
          <div className="mt-3 mb-2 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                useModals.getState().openLogin();
              }}
              title="Connect wallet"
              aria-label="Connect wallet"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-[#a99ad4] transition-colors hover:border-[#8b7ec8]/40 hover:bg-[#8b7ec8]/[0.08] hover:text-[#c4b8e6]"
            >
              <Wallet className="h-3.5 w-3.5" />
            </button>
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

        {/* Create button */}
        <div className={collapsed ? 'mb-3 mt-1 flex justify-center' : 'px-3 mb-3'}>
          {isSignedIn ? (
            collapsed ? (
              <Link
                href="/create/new"
                title="Create game"
                aria-label="Create game"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#8b7ec8] text-white transition-colors hover:bg-[#7a6db8]"
              >
                <Plus className="h-4 w-4" />
              </Link>
            ) : (
              <Link
                href="/create/new"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#8b7ec8] py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#7a6db8]"
              >
                <Plus className="h-3.5 w-3.5" />
                Create
              </Link>
            )
          ) : collapsed ? (
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                useModals.getState().openLogin();
              }}
              title="Sign in to create"
              aria-label="Sign in to create"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#8b7ec8] text-white transition-colors hover:bg-[#7a6db8]"
            >
              <Plus className="h-4 w-4" />
            </button>
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

        {/* Primary nav */}
        <nav className={`flex-1 overflow-y-auto ${collapsed ? 'px-2' : 'px-2'}`}>
          {mainNav.map(({ href, label: navLabel, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <NavItem
                key={href}
                href={href}
                label={navLabel}
                Icon={Icon}
                active={active}
                collapsed={collapsed}
              />
            );
          })}

          <div className="my-2 h-px bg-white/[0.04]" />

          {bottomNav.map(({ href, label: navLabel, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <NavItem
                key={href}
                href={href}
                label={navLabel}
                Icon={Icon}
                active={active}
                collapsed={collapsed}
              />
            );
          })}
        </nav>

        {isSignedIn && (
          <div className={collapsed ? 'pb-3' : 'px-2 pb-3'}>
            <DisconnectButton collapsed={collapsed} />
          </div>
        )}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* Global community-chat widget — single floating button anchored
          bottom-right across every dashboard route. */}
      <CommunityChat />
    </div>
  );
}

// Single nav item — handles collapsed (icon-only with native tooltip) and
// expanded (icon + label) states. Extracting it keeps the two nav lists
// readable and ensures both groups stay structurally identical.
function NavItem({
  href,
  label,
  Icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
}) {
  const stateClasses = active
    ? 'bg-[#8b7ec8]/[0.12] text-[#a99ad4]'
    : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70';
  if (collapsed) {
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        title={label}
        aria-label={label}
        className={`mx-auto mb-1 flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${stateClasses}`}
      >
        <Icon className="h-4 w-4" />
      </Link>
    );
  }
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${stateClasses}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
