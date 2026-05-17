'use client';

import { useEffect } from 'react';
import { useModals } from '@/lib/ui/modals';

export function AuthListener() {
  useEffect(() => {
    function onAuthRequired() {
      useModals.getState().openLogin();
    }
    window.addEventListener('arcadery:auth-required', onAuthRequired);
    return () => window.removeEventListener('arcadery:auth-required', onAuthRequired);
  }, []);
  return null;
}
