'use client';

import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { createClient } from '@/lib/supabase/client';
import { signInWithSolana, SIGNED_IN_BEFORE_KEY } from '@/lib/auth/siws';

/**
 * Reconciles wallet-adapter state with Supabase auth on every page load.
 *
 * Without this, `autoConnect` reconnects the wallet but Supabase may still be
 * signed out (cookie expired / cross-device / cleared) — leaving the UI in a
 * confusing "Connect wallet" state while Phantom is in fact connected. This
 * bridge attempts a silent SIWS sign-in once per wallet/page lifecycle. If the
 * user rejects the signature, we do NOT retry automatically — they can still
 * trigger sign-in manually via the "Connect wallet" button.
 *
 * Wallet-switch while signed-in: if the connected wallet's public key differs
 * from the Supabase user's stored wallet, sign out first so the next SIWS
 * binds the new identity (avoids spoofing the old session).
 */
export function WalletAuthBridge() {
  const { publicKey, signMessage, connected } = useWallet();
  // pk that has been rejected this session — stops popup loops. Cleared when
  // the wallet disconnects or Supabase emits SIGNED_OUT (explicit logout).
  const rejectedFor = useRef<string | null>(null);
  // pk currently being attempted — guards against effect re-fires racing.
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    if (!connected) {
      rejectedFor.current = null;
      inFlight.current = null;
    }
  }, [connected]);

  useEffect(() => {
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        rejectedFor.current = null;
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!connected || !publicKey || !signMessage) return;

    // Only auto-prompt users who have completed SIWS on this device before.
    // New visitors should pick a wallet and click Sign in explicitly — an
    // unsolicited Phantom popup on the marketing page is hostile UX.
    try {
      if (typeof localStorage === 'undefined') return;
      if (!localStorage.getItem(SIGNED_IN_BEFORE_KEY)) return;
    } catch {
      return;
    }

    const pk = publicKey.toBase58();
    if (rejectedFor.current === pk) return;
    if (inFlight.current === pk) return;

    let cancelled = false;
    inFlight.current = pk;

    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        const user = data.session?.user ?? null;
        const sessionWallet =
          (user?.user_metadata?.wallet_address as string | undefined) ?? null;

        // Already signed in with this wallet (or a legacy session pre-dating
        // wallet metadata) — nothing to do.
        if (user && (!sessionWallet || sessionWallet === pk)) return;

        // Signed in with a different wallet than what's connected — sign out
        // so the next SIWS rebinds to the connected wallet's identity.
        if (user && sessionWallet && sessionWallet !== pk) {
          await supabase.auth.signOut();
          if (cancelled) return;
        }

        await signInWithSolana({ publicKey, signMessage });
      } catch {
        // Only mark pk as rejected after a real attempt failed — transient
        // publicKey=null mid-flight should not permanently block SIWS.
        if (!cancelled) rejectedFor.current = pk;
      } finally {
        if (inFlight.current === pk) inFlight.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connected, publicKey, signMessage]);

  return null;
}
