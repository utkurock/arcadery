'use client';

import { useCredits } from '@/lib/credits/context';
import { useModals } from '@/lib/ui/modals';

export function TopUpButton({
  label,
  mode,
}: {
  label: string;
  mode: 'buy' | 'login';
}) {
  const { openBuyModal } = useCredits();

  function handleClick() {
    if (mode === 'buy') openBuyModal();
    else useModals.getState().openLogin();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center rounded-full bg-[#8b7ec8] px-5 py-2 text-sm font-semibold text-white hover:bg-[#7a6db8] transition-colors"
    >
      {label}
    </button>
  );
}
