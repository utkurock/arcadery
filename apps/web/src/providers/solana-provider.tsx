'use client';

import { useMemo, type ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import type { Adapter } from '@solana/wallet-adapter-base';
import { defaultRpcUrlForCluster } from '@/lib/credits/config';

// Stable localStorage key for the wallet adapter so a redeploy under a
// different default key doesn't silently drop returning users.
const WALLET_STORAGE_KEY = 'arcadery:wallet';

export function SolanaProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(
    () =>
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      defaultRpcUrlForCluster(process.env.NEXT_PUBLIC_SOLANA_CLUSTER),
    [],
  );

  const wallets = useMemo<Adapter[]>(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect
        localStorageKey={WALLET_STORAGE_KEY}
        onError={(err) => {
          // wallet-adapter logs to console on its own; swallow here so a wallet
          // error during autoConnect (e.g. extension still booting) doesn't
          // surface as an unhandled rejection in production.
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.debug('[wallet]', err.message);
          }
        }}
      >
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
