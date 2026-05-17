'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function WalletAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-0.5 font-mono text-xs text-white/60 hover:bg-white/[0.08] hover:text-white transition-colors"
      title={address}
    >
      {address.slice(0, 4)}…{address.slice(-4)}
      {copied ? (
        <Check className="w-3 h-3 text-emerald-400" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
    </button>
  );
}
