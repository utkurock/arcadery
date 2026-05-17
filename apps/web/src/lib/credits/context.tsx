'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createClient } from '@/lib/supabase/client';

type CreditsState = {
  balance: number | null;
  loading: boolean;
  signedIn: boolean;
  userId: string | null;
  refresh: () => Promise<number | null>;
  setBalance: (next: number) => void;
  openBuyModal: () => void;
  closeBuyModal: () => void;
  isBuyModalOpen: boolean;
};

const CreditsContext = createContext<CreditsState | null>(null);

export function CreditsProvider({ children }: { children: React.ReactNode }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBuyModalOpen, setBuyModalOpen] = useState(false);
  const mountedRef = useRef(true);

  const fetchBalance = useCallback(async (uid: string | null): Promise<number | null> => {
    if (!uid) return null;
    const supabase = createClient();
    const { data, error } = await supabase
      .from('user_credits')
      .select('balance')
      .eq('user_id', uid)
      .maybeSingle<{ balance: number }>();
    if (error) {
      console.warn('balance fetch failed', error.message);
      return null;
    }
    return data?.balance ?? 0;
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return null;
    const next = await fetchBalance(userId);
    if (mountedRef.current && next != null) setBalance(next);
    return next;
  }, [fetchBalance, userId]);

  // Track auth state
  useEffect(() => {
    mountedRef.current = true;
    const supabase = createClient();

    // Watchdog: drop out of the `loading` gate after a few seconds even if
    // `getUser()` never resolves (offline, blocked, Supabase outage). Without
    // this, anything gated on `useCredits().loading` (the credit pill, etc.)
    // stays hidden forever instead of falling back to the signed-out empty
    // state.
    const watchdog = setTimeout(() => {
      if (mountedRef.current) setLoading(false);
    }, 6000);

    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (!mountedRef.current) return;
        const uid = data.user?.id ?? null;
        setUserId(uid);
        if (uid) {
          const bal = await fetchBalance(uid);
          if (mountedRef.current) setBalance(bal);
        } else {
          setBalance(null);
        }
      })
      .catch(() => {
        // Best-effort: a failed getUser() shouldn't lock the rest of the UI.
        if (mountedRef.current) setBalance(null);
      })
      .finally(() => {
        clearTimeout(watchdog);
        if (mountedRef.current) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mountedRef.current) return;
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const bal = await fetchBalance(uid);
        if (mountedRef.current) setBalance(bal);
      } else {
        setBalance(null);
        setBuyModalOpen(false);
      }
    });

    return () => {
      mountedRef.current = false;
      clearTimeout(watchdog);
      sub.subscription.unsubscribe();
    };
  }, [fetchBalance]);

  const setBalanceExternal = useCallback((next: number) => setBalance(next), []);
  const openBuyModal = useCallback(() => setBuyModalOpen(true), []);
  const closeBuyModal = useCallback(() => setBuyModalOpen(false), []);

  // Listen for insufficient-credits events dispatched from AI call sites
  useEffect(() => {
    function onOutOfCredits() {
      setBuyModalOpen(true);
    }
    window.addEventListener('arcadery:insufficient-credits', onOutOfCredits);
    return () => window.removeEventListener('arcadery:insufficient-credits', onOutOfCredits);
  }, []);

  const value = useMemo<CreditsState>(
    () => ({
      balance,
      loading,
      signedIn: userId != null,
      userId,
      refresh,
      setBalance: setBalanceExternal,
      openBuyModal,
      closeBuyModal,
      isBuyModalOpen,
    }),
    [balance, loading, userId, refresh, setBalanceExternal, openBuyModal, closeBuyModal, isBuyModalOpen],
  );

  return <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>;
}

export function useCredits(): CreditsState {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error('useCredits must be used inside CreditsProvider');
  return ctx;
}
