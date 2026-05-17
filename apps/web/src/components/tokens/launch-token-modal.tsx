'use client';

import { useEffect, useState } from 'react';
import { Connection, Transaction } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { X, Coins, Loader2, Check, AlertCircle } from 'lucide-react';
import { useCredits } from '@/lib/credits/context';
import { defaultRpcUrlForCluster } from '@/lib/credits/config';

const TICKER_RE = /^[A-Z0-9]{2,10}$/;

type Phase = 'idle' | 'building' | 'signing' | 'submitting' | 'confirming' | 'recording' | 'done' | 'error';

export function LaunchTokenModal({
  open,
  onClose,
  gameId,
  gameName,
  defaultTicker,
  defaultImageUrl,
  onLaunched,
}: {
  open: boolean;
  onClose: () => void;
  gameId: string;
  gameName: string;
  /** Pre-filled ticker from scene.economy.token.symbol — saves the user from
   *  re-typing what they already configured in the Game Economy panel. */
  defaultTicker?: string;
  defaultImageUrl?: string;
  onLaunched: (tokenMint: string) => void;
}) {
  const { publicKey, signTransaction, connected } = useWallet();
  const { balance, signedIn } = useCredits();

  // Sanitize incoming defaults to the regex the launch route enforces. An
  // economy panel that has empty / invalid values shouldn't break the form.
  const sanitizedDefaultTicker =
    defaultTicker && TICKER_RE.test(defaultTicker.toUpperCase())
      ? defaultTicker.toUpperCase()
      : '';

  const [ticker, setTicker] = useState(sanitizedDefaultTicker);
  const [tokenName, setTokenName] = useState(gameName.slice(0, 32));
  const [imageUrl, setImageUrl] = useState(defaultImageUrl ?? '');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [tokenMint, setTokenMint] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPhase('idle');
      setError(null);
      setTokenMint(null);
      setTicker(sanitizedDefaultTicker);
      setTokenName(gameName.slice(0, 32));
      setImageUrl(defaultImageUrl ?? '');
    }
  // sanitizedDefaultTicker derives synchronously from defaultTicker —
  // including the source prop is enough to keep this in sync.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gameName, defaultTicker, defaultImageUrl]);

  if (!open) return null;

  const tickerValid = TICKER_RE.test(ticker);
  const nameValid = tokenName.trim().length >= 2 && tokenName.length <= 32;
  const enoughCredits = (balance ?? 0) >= 10;
  const isBusy =
    phase === 'building' || phase === 'signing' || phase === 'submitting' || phase === 'confirming' || phase === 'recording';
  const canSubmit =
    !isBusy && tickerValid && nameValid && connected && signedIn && enoughCredits;

  async function handleLaunch() {
    if (!publicKey || !signTransaction) {
      setError('Wallet not connected');
      setPhase('error');
      return;
    }

    setError(null);
    setPhase('building');
    try {
      const launchRes = await fetch('/api/tokens/launch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          gameId,
          ticker: ticker.toUpperCase(),
          name: tokenName.trim(),
          imageUrl: imageUrl.trim() || undefined,
        }),
      });
      if (!launchRes.ok) {
        const payload = await launchRes.json().catch(() => ({}));
        throw new Error(payload.error ?? `Launch build failed (${launchRes.status})`);
      }
      const { serializedTx, mintAddress, configAddress } = (await launchRes.json()) as {
        serializedTx: string;
        mintAddress: string;
        configAddress: string;
      };

      // Deserialize, sign with wallet, submit
      const txBytes = Uint8Array.from(Buffer.from(serializedTx, 'base64'));
      const tx = Transaction.from(txBytes);

      setPhase('signing');
      const signed = await signTransaction(tx);

      setPhase('submitting');
      const rpcUrl =
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
        defaultRpcUrlForCluster(process.env.NEXT_PUBLIC_SOLANA_CLUSTER);
      const conn = new Connection(rpcUrl, 'confirmed');
      const sig = await conn.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      setPhase('confirming');
      const confirmation = await conn.confirmTransaction(sig, 'confirmed');
      if (confirmation.value.err) {
        throw new Error(`On-chain failure: ${JSON.stringify(confirmation.value.err)}`);
      }

      setPhase('recording');
      const confirmRes = await fetch('/api/tokens/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          gameId,
          txSignature: sig,
          mintAddress,
          ticker: ticker.toUpperCase(),
          tokenName: tokenName.trim(),
          imageUrl: imageUrl.trim() || undefined,
          configAddress,
        }),
      });
      if (!confirmRes.ok) {
        const payload = await confirmRes.json().catch(() => ({}));
        throw new Error(payload.error ?? `Confirm failed (${confirmRes.status})`);
      }

      setTokenMint(mintAddress);
      setPhase('done');
      onLaunched(mintAddress);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Token launch failed');
      setPhase('error');
    }
  }

  const phaseLabel: Record<Phase, string> = {
    idle: `Launch token (10 credits + ~0.03 SOL)`,
    building: 'Preparing transaction…',
    signing: 'Approve in wallet…',
    submitting: 'Submitting to Solana…',
    confirming: 'Waiting for confirmation…',
    recording: 'Saving on Arcadery…',
    done: 'Launched',
    error: 'Try again',
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isBusy) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#13141a] p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-[#c9a96e]" />
            <h2 className="text-lg font-semibold text-white">Launch token</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isBusy}
            className="text-white/40 hover:text-white/80 disabled:opacity-30"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {phase === 'done' ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <Check className="h-6 w-6 text-green-500" />
            </div>
            <p className="text-white font-medium">Token launched!</p>
            {tokenMint && (
              <p className="mt-2 font-mono text-[11px] text-white/40 break-all px-2">
                {tokenMint}
              </p>
            )}
            <button
              onClick={onClose}
              className="mt-5 w-full rounded-xl bg-[#8b7ec8] py-2.5 text-sm font-semibold text-white hover:bg-[#7a6db8]"
            >
              Continue
            </button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-xs text-white/50 leading-relaxed">
              Launch this game&apos;s token on Solana via Meteora. Trading fees split{' '}
              <strong className="text-white/80">70% creator / 30% platform</strong>. Pool graduates
              to AMM at <strong className="text-white/80">80 SOL</strong> raised.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-white/40 mb-1.5">
                  Ticker (2-10 letters)
                </label>
                <input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="MYGAME"
                  disabled={isBusy}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-mono text-white placeholder:text-white/25 outline-none focus:border-[#8b7ec8]/40 disabled:opacity-60"
                  maxLength={10}
                />
                {ticker.length > 0 && !tickerValid && (
                  <p className="mt-1 text-[11px] text-amber-400">
                    Use 2-10 uppercase letters or digits.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-widest text-white/40 mb-1.5">
                  Token name
                </label>
                <input
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder={gameName}
                  disabled={isBusy}
                  maxLength={32}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#8b7ec8]/40 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-widest text-white/40 mb-1.5">
                  Image URL (optional)
                </label>
                <input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://…/sprite.png"
                  disabled={isBusy}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#8b7ec8]/40 disabled:opacity-60"
                />
                <p className="mt-1 text-[11px] text-white/30">
                  Used as the token&apos;s metadata image. Leave blank for a default.
                </p>
              </div>
            </div>

            {!signedIn && (
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <AlertCircle className="h-3.5 w-3.5" /> Sign in first.
              </p>
            )}
            {signedIn && !connected && (
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <AlertCircle className="h-3.5 w-3.5" /> Connect your wallet.
              </p>
            )}
            {signedIn && !enoughCredits && (
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <AlertCircle className="h-3.5 w-3.5" /> Need 10 credits — you have {balance ?? 0}.
              </p>
            )}

            <button
              onClick={handleLaunch}
              disabled={!canSubmit}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#8b7ec8] py-3 text-sm font-semibold text-white hover:bg-[#7a6db8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {phaseLabel[phase]}
            </button>

            {error && (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 break-words">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
