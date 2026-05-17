'use client';

import { useEffect } from 'react';

/**
 * Lock the document body's scroll while a modal/dialog is open. Restores the
 * previous overflow value on close so multiple modals nest cleanly.
 *
 * Usage:
 *   useScrollLock(isOpen);
 *
 * NOTE: We don't measure scrollbar width to compensate for layout shift here —
 * Arcadery is a dark, fixed-width-friendly UI; the shift is invisible. Add a
 * paddingRight tweak if a future page makes the shift obvious.
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
