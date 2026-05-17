'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console; in production wire to your error tracker.
    console.error('App error boundary caught:', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a0f] px-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
          <AlertTriangle className="h-6 w-6 text-red-400" />
        </div>
        <h1 className="mb-2 text-lg font-semibold">Something went wrong</h1>
        <p className="mb-1 text-sm text-white/60">
          The page hit an unexpected error. Try again or head home.
        </p>
        {error.digest && (
          <p className="mb-6 font-mono text-[11px] text-white/30">
            ref: {error.digest}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#8b7ec8] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7a6db8]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-sm font-medium text-white/80 hover:bg-white/[0.08] hover:text-white"
          >
            <Home className="h-3.5 w-3.5" />
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
