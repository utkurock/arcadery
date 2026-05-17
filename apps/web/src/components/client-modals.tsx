'use client';

import dynamic from 'next/dynamic';
import { useModals } from '@/lib/ui/modals';
import { useCredits } from '@/lib/credits/context';

const LoginModal = dynamic(
  () => import('@/components/auth/login-modal').then((m) => m.LoginModal),
  { ssr: false },
);

const BuyCreditsModal = dynamic(
  () => import('@/components/credits/buy-credits-modal').then((m) => m.BuyCreditsModal),
  { ssr: false },
);

const OnboardingModal = dynamic(
  () => import('@/components/auth/onboarding-modal').then((m) => m.OnboardingModal),
  { ssr: false },
);

/**
 * Modals are mounted only when open. Buy/login modals disable their close
 * button while busy, so the user can't trigger an unmount mid-tx through the
 * UI — and conditional mounting avoids "WalletContext without provider"
 * warnings during prerender.
 */
export function ClientModals() {
  const loginOpen = useModals((s) => s.loginOpen);
  const onboardingOpen = useModals((s) => s.onboardingOpen);
  const buyOpen = useCredits().isBuyModalOpen;
  return (
    <>
      {loginOpen ? <LoginModal /> : null}
      {buyOpen ? <BuyCreditsModal /> : null}
      {onboardingOpen ? <OnboardingModal /> : null}
    </>
  );
}
