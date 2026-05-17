'use client';

import { create } from 'zustand';

type ModalsState = {
  loginOpen: boolean;
  openLogin: () => void;
  closeLogin: () => void;
  onboardingOpen: boolean;
  openOnboarding: () => void;
  closeOnboarding: () => void;
};

export const useModals = create<ModalsState>((set) => ({
  loginOpen: false,
  openLogin: () => set({ loginOpen: true }),
  closeLogin: () => set({ loginOpen: false }),
  onboardingOpen: false,
  openOnboarding: () => set({ onboardingOpen: true }),
  closeOnboarding: () => set({ onboardingOpen: false }),
}));
