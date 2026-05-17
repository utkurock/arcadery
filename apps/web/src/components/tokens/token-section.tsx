'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Coins, Sparkles } from 'lucide-react';

const LaunchTokenModal = dynamic(
  () => import('./launch-token-modal').then((m) => m.LaunchTokenModal),
  { ssr: false },
);
const SwapTokenModal = dynamic(
  () => import('./swap-token-modal').then((m) => m.SwapTokenModal),
  { ssr: false },
);

type GameToken = {
  id: string;
  name: string;
  is_tokenized: boolean | null;
  token_mint: string | null;
  token_symbol: string | null;
  token_image_url: string | null;
};

/** Tokenomics defaults pulled from `scene.economy.token` so the creator only
 *  fills them once in the Game Economy panel, not again at launch time. */
export type EconomyTokenDefaults = {
  name?: string;
  symbol?: string;
  image?: string;
};

export function TokenSection({
  game,
  isOwner,
  cluster = 'mainnet',
  economyDefaults,
}: {
  game: GameToken;
  isOwner: boolean;
  cluster?: 'mainnet' | 'devnet';
  economyDefaults?: EconomyTokenDefaults;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [tokenized, setTokenized] = useState(!!game.is_tokenized && !!game.token_mint);
  const [mint, setMint] = useState(game.token_mint);
  const [symbol, setSymbol] = useState(game.token_symbol);
  // null while we don't know yet; only gates the owner CTA so non-owners pay nothing.
  const [platformConfigured, setPlatformConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isOwner || tokenized) return;
    let alive = true;
    fetch('/api/tokens/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setPlatformConfigured(Boolean(d?.configured));
      })
      .catch(() => {
        if (alive) setPlatformConfigured(null);
      });
    return () => {
      alive = false;
    };
  }, [isOwner, tokenized]);

  // Tokenized: anyone sees in-app Trade modal + Solscan address chip.
  // Modal falls back to the Meteora launchpad if the pool has graduated.
  if (tokenized && mint) {
    const explorerUrl = `https://solscan.io/token/${mint}${cluster === 'devnet' ? '?cluster=devnet' : ''}`;
    const meteoraUrl = `https://launch.meteora.ag/token/${mint}${cluster === 'devnet' ? '?cluster=devnet' : ''}`;
    const tickerLabel = symbol ?? '???';
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSwapOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a96e]/40 bg-[#c9a96e]/[0.1] px-3 py-1.5 text-xs font-semibold text-[#c9a96e] hover:bg-[#c9a96e]/[0.2] transition-colors"
        >
          <Coins className="h-3.5 w-3.5" />
          Trade ${tickerLabel}
        </button>
        <Link
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] text-white/30 hover:text-white/60"
          title={mint}
        >
          {mint.slice(0, 4)}…{mint.slice(-4)}
        </Link>
        {swapOpen && (
          <SwapTokenModal
            open={swapOpen}
            onClose={() => setSwapOpen(false)}
            tokenMint={mint}
            ticker={tickerLabel}
            cluster={cluster}
            meteoraFallbackUrl={meteoraUrl}
          />
        )}
      </div>
    );
  }

  // Owner, not tokenized: show launch CTA. Disabled if the platform config
  // hasn't been deployed yet — opening the modal would just lead to a 503.
  if (isOwner) {
    const disabled = platformConfigured === false;
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={disabled}
          title={disabled ? 'Token launches are temporarily unavailable.' : undefined}
          className="inline-flex items-center gap-2 rounded-full border border-[#c9a96e]/40 bg-[#c9a96e]/[0.08] px-4 py-2 text-sm font-semibold text-[#c9a96e] hover:bg-[#c9a96e]/[0.15] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#c9a96e]/[0.08]"
        >
          <Sparkles className="h-4 w-4" />
          Launch token
        </button>
        {modalOpen && (
          <LaunchTokenModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            gameId={game.id}
            gameName={economyDefaults?.name?.trim() || game.name}
            defaultTicker={economyDefaults?.symbol?.trim().toUpperCase()}
            defaultImageUrl={
              economyDefaults?.image?.trim() || game.token_image_url || undefined
            }
            onLaunched={(tokenMint) => {
              setTokenized(true);
              setMint(tokenMint);
            }}
          />
        )}
      </>
    );
  }

  // Non-owner, not tokenized: nothing to show
  return null;
}
