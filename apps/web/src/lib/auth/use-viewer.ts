'use client';

import { useEffect } from 'react';
import { create, type UseBoundStore, type StoreApi } from 'zustand';
import { createClient } from '@/lib/supabase/client';

type Viewer =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | {
      status: 'signed-in';
      userId: string;
      walletAddress: string | null;
      displayName: string | null;
      avatarUrl: string | null;
    };

type ProfileBits = {
  display_name: string | null;
  wallet_address: string | null;
  avatar_url: string | null;
};

const PROFILE_UPDATED_EVENT = 'arcadery:profile-updated';

export function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

// Single global viewer store. Previously `useViewer` kept per-hook state, so
// the home page (with 2 AuthButton instances), the dashboard layout, and the
// portal dropdown all ran independent `getSession()` calls racing each other.
// One losing the race + 1.5s watchdog firing was the "site forgets I'm signed
// in until F5" symptom. One store, one subscription, one truth.
//
// Both the store and the `initialized` flag live on globalThis so that Fast
// Refresh re-evaluating this module in dev doesn't reset state out from under
// active subscriptions (which used to force a full reload and crash R3F's
// Canvas reconciler with "Hooks can only be used within the Canvas component").
type ViewerStore = {
  viewer: Viewer;
  setViewer: (v: Viewer) => void;
};

type ViewerHook = UseBoundStore<StoreApi<ViewerStore>>;

const STORE_KEY = '__arcadery_viewer_store__' as const;
const INIT_KEY = '__arcadery_viewer_initialized__' as const;

type GlobalSlot = typeof globalThis & {
  [STORE_KEY]?: ViewerHook;
  [INIT_KEY]?: boolean;
};

function getViewerStore(): ViewerHook {
  const g = globalThis as GlobalSlot;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = create<ViewerStore>((set) => ({
      viewer: { status: 'loading' },
      setViewer: (v) => set({ viewer: v }),
    }));
  }
  return g[STORE_KEY]!;
}

const useViewerStore: ViewerHook = getViewerStore();

function isInitialized() {
  return (globalThis as GlobalSlot)[INIT_KEY] === true;
}
function markInitialized() {
  (globalThis as GlobalSlot)[INIT_KEY] = true;
}

function applyAuth(userId: string | null, walletFromAuth: string | null) {
  const { setViewer } = useViewerStore.getState();
  if (!userId) {
    setViewer({ status: 'signed-out' });
    return;
  }
  setViewer({
    status: 'signed-in',
    userId,
    walletAddress: walletFromAuth,
    displayName: null,
    avatarUrl: null,
  });
  enrichWithProfile(userId, walletFromAuth);
}

function enrichWithProfile(userId: string, walletFromAuth: string | null) {
  const supabase = createClient();
  supabase
    .from('user_profiles')
    .select('display_name, wallet_address, avatar_url')
    .eq('id', userId)
    .maybeSingle<ProfileBits>()
    .then(({ data }) => {
      const current = useViewerStore.getState().viewer;
      // Skip if the user signed out between the request and the response.
      if (current.status !== 'signed-in' || current.userId !== userId) return;
      if (!data) return;
      useViewerStore.getState().setViewer({
        status: 'signed-in',
        userId,
        walletAddress: data.wallet_address ?? walletFromAuth,
        displayName: data.display_name ?? null,
        avatarUrl: data.avatar_url ?? null,
      });
    });
}

function initViewerSubscription() {
  if (isInitialized()) return;
  if (typeof window === 'undefined') return;
  markInitialized();
  const supabase = createClient();

  // Hard watchdog only on the absolute initial load — if getSession() never
  // resolves (extension interference, blocked storage), fall back to
  // signed-out so the UI is never stuck on the skeleton. We do NOT re-arm
  // this on subsequent auth events: once we have ANY resolved state, that's
  // truth until the next auth event changes it.
  const watchdog = setTimeout(() => {
    if (useViewerStore.getState().viewer.status === 'loading') {
      useViewerStore.getState().setViewer({ status: 'signed-out' });
    }
  }, 3000);

  supabase.auth
    .getSession()
    .then(({ data }) => {
      clearTimeout(watchdog);
      const u = data.session?.user ?? null;
      applyAuth(u?.id ?? null, (u?.user_metadata?.wallet_address as string) ?? null);
    })
    .catch(() => {
      clearTimeout(watchdog);
      useViewerStore.getState().setViewer({ status: 'signed-out' });
    });

  supabase.auth.onAuthStateChange((_event, session) => {
    const u = session?.user ?? null;
    applyAuth(u?.id ?? null, (u?.user_metadata?.wallet_address as string) ?? null);
  });

  window.addEventListener(PROFILE_UPDATED_EVENT, () => {
    const current = useViewerStore.getState().viewer;
    if (current.status !== 'signed-in') return;
    enrichWithProfile(current.userId, current.walletAddress);
  });
}

export function useViewer(): Viewer {
  // Idempotent: first call from any component spins up the singleton sub.
  // Subsequent calls just subscribe to the store.
  useEffect(() => {
    initViewerSubscription();
  }, []);
  // Initialize synchronously too — if a component reads on first render
  // before the effect runs, the subscription is already armed.
  if (typeof window !== 'undefined' && !isInitialized()) {
    initViewerSubscription();
  }
  return useViewerStore((s) => s.viewer);
}

export function notifyProfileUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT));
}
