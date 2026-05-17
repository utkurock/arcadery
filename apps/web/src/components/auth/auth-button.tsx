'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { ChevronDown, Coins, LogOut, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useModals } from '@/lib/ui/modals';
import { useViewer, truncateAddress } from '@/lib/auth/use-viewer';
import { SIGNED_IN_BEFORE_KEY } from '@/lib/auth/siws';
import { useCredits } from '@/lib/credits/context';
import { Avatar } from '@/components/ui/avatar';

const MENU_WIDTH = 192; // matches w-48 below; used for viewport-edge clamp.

export function AuthButton() {
  const router = useRouter();
  const { disconnect, connected } = useWallet();
  const viewer = useViewer();
  const { balance, signedIn } = useCredits();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  // Compute the menu position from the trigger's bounding rect every time
  // the menu opens — and on scroll/resize while open. Portal-rendered menus
  // need this because they're no longer positioned relative to the trigger
  // in the DOM tree.
  useLayoutEffect(() => {
    if (!menuOpen) return;
    function reposition() {
      const t = triggerRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      const left = Math.max(8, Math.min(window.innerWidth - MENU_WIDTH - 8, r.right - MENU_WIDTH));
      setMenuPos({ top: r.bottom + 6, left });
    }
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [menuOpen]);

  // Outside-click closer. `click` (not `mousedown`) so menu items get their
  // click handler before the document listener closes the dropdown.
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('click', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const go = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };

  async function handleSignOut() {
    const supabase = createClient();
    try {
      await supabase.auth.signOut();
      await disconnect().catch(() => {});
    } finally {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(SIGNED_IN_BEFORE_KEY);
        }
      } catch {}
      setMenuOpen(false);
      router.push('/');
    }
  }

  if (viewer.status === 'loading') {
    return <div className="h-8 w-24 rounded-full bg-white/5 animate-pulse" />;
  }

  if (viewer.status === 'signed-out') {
    const label = connected ? 'Sign in' : 'Connect wallet';
    return (
      <button
        type="button"
        onClick={() => useModals.getState().openLogin()}
        className="rounded-full bg-[#8b7ec8] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7a6db8]"
      >
        {label}
      </button>
    );
  }

  const label = viewer.walletAddress ? truncateAddress(viewer.walletAddress) : 'Account';
  const fallback = viewer.displayName || viewer.walletAddress || '?';
  const creditDisplay = signedIn && balance != null ? balance : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1 pl-1 pr-3 text-[13px] font-medium text-white/90 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
      >
        <Avatar src={viewer.avatarUrl} fallback={fallback} size="xs" />
        <span className="font-mono">{label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 opacity-60 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {menuOpen && menuPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
              className="z-[100] overflow-hidden rounded-lg border border-white/10 bg-[#13141a] shadow-2xl"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => go(`/profile/${viewer.userId}`)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/[0.05] hover:text-white"
              >
                <User className="h-4 w-4" />
                Profile
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => go('/credits')}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/[0.05] hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <Coins className="h-4 w-4" />
                  Credits
                </span>
                {creditDisplay != null && (
                  <span className="font-mono text-[11px] tabular-nums text-white/50">
                    {creditDisplay}
                  </span>
                )}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 border-t border-white/[0.06] px-3 py-2 text-left text-sm text-white/60 hover:bg-white/[0.05] hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                Disconnect
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
