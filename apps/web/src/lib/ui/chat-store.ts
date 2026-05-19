'use client';

import { create } from 'zustand';

// Global chat open/close state. The trigger button (rendered inside each
// page's header next to the search input) toggles the panel; the panel
// itself lives in the dashboard layout so it survives page navigations.
// Decoupling state from rendering means triggers can appear anywhere on
// the page without prop-drilling.

interface ChatStore {
  open: boolean;
  setOpen: (next: boolean) => void;
  toggle: () => void;
}

const STORAGE_KEY = 'arcadery:chat-open';

function initialOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persist(next: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {}
}

export const useChatStore = create<ChatStore>((set, get) => ({
  open: initialOpen(),
  setOpen: (next) => {
    persist(next);
    set({ open: next });
  },
  toggle: () => {
    const next = !get().open;
    persist(next);
    set({ open: next });
  },
}));
