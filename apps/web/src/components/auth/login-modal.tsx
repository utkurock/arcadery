'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { signInWithSolana } from '@/lib/auth/siws';
import { WalletPicker } from '@/components/auth/wallet-picker';
import { useModals } from '@/lib/ui/modals';
import { useScrollLock } from '@/lib/ui/use-scroll-lock';
import { WELCOME_BONUS } from '@/lib/credits/config';

type Status = 'idle' | 'signing' | 'verifying' | 'error';

export function LoginModal() {
  const open = useModals((s) => s.loginOpen);
  const close = useModals((s) => s.closeLogin);
  const { publicKey, signMessage, connected, disconnect, wallet } = useWallet();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  useScrollLock(open);

  // Auto-close if already authenticated; subscribe to auth changes while open
  // so SIWS completed elsewhere (other tab) doesn't leave the modal stranded.
  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) close();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') close();
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) {
      setStatus('idle');
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const busy = status === 'signing' || status === 'verifying';

  async function handleSign() {
    if (!connected || !publicKey || !signMessage) {
      setError('Wallet not connected');
      setStatus('error');
      return;
    }
    try {
      setError(null);
      setStatus('signing');
      const result = await signInWithSolana({ publicKey, signMessage });
      setStatus('verifying');
      close();
      // Brand-new user → open the onboarding tour (4-slide intro). Returning
      // users skip it. We still respect the per-device "already seen it" flag
      // for cases where signup happens twice on the same device (rare but
      // possible: account recreation, wallet swap).
      if (result.isNewUser) {
        const { maybeOpenOnboardingForNewUser } = await import(
          '@/components/auth/onboarding-modal'
        );
        maybeOpenOnboardingForNewUser();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setStatus('error');
    }
  }

  async function handleSwitchWallet() {
    setError(null);
    setStatus('idle');
    try {
      await disconnect();
    } catch {}
  }

  const walletLabel = wallet?.adapter.name || 'wallet';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#13141a] p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {connected ? 'Sign in' : 'Connect wallet'}
            </h2>
            <p className="mt-0.5 text-xs text-white/50">
              {connected
                ? `Sign a message with ${walletLabel} to continue.`
                : 'Choose a Solana wallet to continue.'}
            </p>
          </div>
          <button
            onClick={close}
            disabled={busy}
            className="text-white/40 hover:text-white/80 disabled:opacity-30"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {WELCOME_BONUS > 0 && (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
            <p className="text-xs">
              <span className="text-white/55">Start with </span>
              <span className="font-semibold text-white">{WELCOME_BONUS} credits</span>
              <span className="text-white/55">, free.</span>
            </p>
          </div>
        )}

        <WalletPicker disabled={busy} />

        {connected && publicKey && (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={handleSign}
              disabled={busy}
              className="w-full rounded-xl bg-[#8b7ec8] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#7a6db8] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'signing'
                ? 'Check your wallet…'
                : status === 'verifying'
                  ? 'Verifying…'
                  : `Sign in with ${walletLabel}`}
            </button>
            <button
              type="button"
              onClick={handleSwitchWallet}
              disabled={busy}
              className="block w-full text-center text-[11px] text-white/40 hover:text-white/70 disabled:opacity-40"
            >
              Use a different wallet
            </button>
          </div>
        )}

        {status === 'error' && error && (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <p className="mt-5 text-center text-[10px] text-white/30">
          By signing in you agree to the terms.
        </p>
      </div>
    </div>
  );
}
