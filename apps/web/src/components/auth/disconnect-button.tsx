'use client';

import { LogOut } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { createClient } from '@/lib/supabase/client';
import { SIGNED_IN_BEFORE_KEY } from '@/lib/auth/siws';

interface Props {
  collapsed?: boolean;
}

export function DisconnectButton({ collapsed = false }: Props) {
  const { disconnect } = useWallet();

  async function handleSignOut() {
    const supabase = createClient();
    // Clear auto-resign flag BEFORE signOut/disconnect — otherwise the bridge
    // could race the SIGNED_OUT subscriber and re-prompt before the flag clears.
    try {
      localStorage.removeItem(SIGNED_IN_BEFORE_KEY);
    } catch {}
    await supabase.auth.signOut();
    await disconnect().catch(() => {});
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={handleSignOut}
        title="Disconnect"
        aria-label="Disconnect"
        className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.04] hover:text-white/60"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-medium text-white/30 transition-colors hover:bg-white/[0.04] hover:text-white/60"
    >
      <LogOut className="h-3.5 w-3.5" />
      Disconnect
    </button>
  );
}
