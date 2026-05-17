'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCredits } from '@/lib/credits/context';
import { useModals } from '@/lib/ui/modals';

export function PricingCta({ tierId }: { tierId: string }) {
  const { openBuyModal } = useCredits();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setSignedIn(!!data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(!!session?.user);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  function handleClick() {
    if (signedIn) {
      openBuyModal();
    } else {
      useModals.getState().openLogin();
    }
  }

  // While Supabase is resolving, render a skeleton pill (same height) rather
  // than an ambiguous "Continue" label that snaps to the real text. Avoids a
  // visible flicker on slow networks and stops a user from clicking before we
  // know whether the right action is buy-credits or sign-in.
  if (signedIn === null) {
    return (
      <div
        data-tier={tierId}
        aria-hidden="true"
        className="h-[44px] w-full animate-pulse rounded-xl bg-white/[0.06]"
      />
    );
  }

  const label = signedIn ? 'Buy credits' : 'Sign in to buy';

  return (
    <button
      type="button"
      onClick={handleClick}
      data-tier={tierId}
      className="w-full rounded-xl bg-[#8b7ec8] py-3 text-sm font-semibold text-white hover:bg-[#7a6db8] transition-colors"
    >
      {label}
    </button>
  );
}
