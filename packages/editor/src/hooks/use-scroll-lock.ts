'use client';

import { useEffect } from 'react';

/**
 * Lock document body scroll while a modal is open. Restores the previous
 * overflow on close so nested modals don't get stuck.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (typeof document === 'undefined') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}
