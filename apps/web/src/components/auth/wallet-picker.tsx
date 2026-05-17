'use client';

import { useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState } from '@solana/wallet-adapter-base';

function describeWalletError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (/reject|denied|cancel/i.test(raw)) return 'Connection cancelled.';
  if (/timeout/i.test(raw)) return 'Wallet timed out — try again.';
  if (/not ready|not installed|not detected/i.test(raw)) return 'Wallet not detected — make sure the extension is installed and unlocked.';
  return raw || 'Wallet connection failed.';
}

export function WalletPicker({ disabled }: { disabled?: boolean }) {
  const { wallets, wallet, select, connecting } = useWallet();
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const ordered = useMemo(() => {
    // Dedupe by adapter name — Wallet Standard auto-discovery can register
    // the same wallet twice (legacy adapter + StandardWalletAdapter). Keep
    // the entry with the highest readyState rank.
    const rank = (s: WalletReadyState) =>
      s === WalletReadyState.Installed ? 0 : s === WalletReadyState.Loadable ? 1 : 2;
    const byName = new Map<string, (typeof wallets)[number]>();
    for (const w of wallets) {
      const existing = byName.get(w.adapter.name);
      if (!existing || rank(w.readyState) < rank(existing.readyState)) {
        byName.set(w.adapter.name, w);
      }
    }
    return [...byName.values()].sort((a, b) => rank(a.readyState) - rank(b.readyState));
  }, [wallets]);

  async function handlePick(name: string) {
    if (disabled || connecting || pendingName) return;
    setConnectError(null);

    const target = ordered.find((w) => w.adapter.name === name);
    if (!target) {
      setConnectError(`${name} not available.`);
      return;
    }

    // Not installed → open the wallet's install page in a new tab.
    if (
      target.readyState !== WalletReadyState.Installed &&
      target.readyState !== WalletReadyState.Loadable
    ) {
      if (target.adapter.url) window.open(target.adapter.url, '_blank', 'noopener');
      return;
    }

    setPendingName(name);
    try {
      // Sync useWallet state for downstream consumers (signMessage etc.).
      if (wallet?.adapter.name !== name) {
        select(name as Parameters<typeof select>[0]);
      }
      // Call the adapter directly — bypasses the select→effect→connect race
      // that can silently fail with Wallet Standard adapters.
      if (!target.adapter.connected) {
        await target.adapter.connect();
      }
    } catch (err) {
      setConnectError(describeWalletError(err));
    } finally {
      setPendingName(null);
    }
  }

  return (
    <div className="space-y-2">
      {ordered.map((w) => {
        const installed = w.readyState === WalletReadyState.Installed;
        const unavailable = w.readyState === WalletReadyState.Unsupported;
        return (
          <button
            key={w.adapter.name}
            type="button"
            disabled={disabled || connecting || unavailable || pendingName !== null}
            onClick={() => handlePick(w.adapter.name)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {w.adapter.icon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={w.adapter.icon} alt="" className="w-6 h-6 rounded" />
            )}
            <span className="flex-1 text-left text-sm font-medium text-white">
              {w.adapter.name}
            </span>
            <span className="text-xs text-white/40">
              {pendingName === w.adapter.name
                ? 'Connecting…'
                : installed
                  ? 'Detected'
                  : unavailable
                    ? 'Unavailable'
                    : 'Install'}
            </span>
          </button>
        );
      })}
      {connectError && (
        <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {connectError}
        </p>
      )}
    </div>
  );
}
