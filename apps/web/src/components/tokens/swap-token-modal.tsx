'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Connection, Transaction } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { X, ArrowDownUp, Loader2, Check, AlertCircle, ExternalLink } from 'lucide-react';
import { defaultRpcUrlForCluster } from '@/lib/credits/config';
import { useCredits } from '@/lib/credits/context';

const SOL_DECIMALS = 9;
const TOKEN_DECIMALS = 6; // matches the launch config (lib/tokens/dbc.ts setup)
const SLIPPAGE_PRESETS = [50, 100, 500] as const; // 0.5% / 1% / 5%

type Direction = 'buy' | 'sell';
type Phase =
  | 'idle'
  | 'quoting'
  | 'building'
  | 'signing'
  | 'submitting'
  | 'confirming'
  | 'done'
  | 'error';

interface QuoteResponse {
  amountOut: string;
  minimumAmountOut: string;
  curveProgress?: number;
  error?: string;
  code?: string;
}

interface SwapResponse {
  serializedTx: string;
  blockhash: string;
  lastValidBlockHeight: number;
  expectedAmountOut: string;
  minimumAmountOut: string;
  error?: string;
  code?: string;
}

function decimalsFor(direction: Direction, side: 'in' | 'out'): number {
  // buy: SOL in, token out. sell: token in, SOL out.
  if (direction === 'buy') return side === 'in' ? SOL_DECIMALS : TOKEN_DECIMALS;
  return side === 'in' ? TOKEN_DECIMALS : SOL_DECIMALS;
}

/** Convert a human decimal string like "0.5" to a base-units decimal string. */
function toBaseUnits(value: string, decimals: number): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d*\.?\d*$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  if (frac.length > decimals) return null;
  const padded = frac.padEnd(decimals, '0');
  const combined = (whole || '0') + padded;
  // Strip leading zeros but keep at least one digit.
  const stripped = combined.replace(/^0+(?=\d)/, '');
  if (stripped === '' || /^0+$/.test(stripped)) return null;
  return stripped;
}

/** Display base-units decimal string as a human number with `decimals` precision. */
function fromBaseUnits(value: string, decimals: number, maxFractionDigits = 6): string {
  if (!value || value === '0') return '0';
  const padded = value.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals).replace(/^0+(?=\d)/, '');
  const frac = padded.slice(padded.length - decimals).slice(0, maxFractionDigits).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

export function SwapTokenModal({
  open,
  onClose,
  tokenMint,
  ticker,
  cluster,
  meteoraFallbackUrl,
}: {
  open: boolean;
  onClose: () => void;
  tokenMint: string;
  ticker: string;
  cluster: 'mainnet' | 'devnet';
  meteoraFallbackUrl: string;
}) {
  const { publicKey, signTransaction, connected } = useWallet();
  const { signedIn } = useCredits();

  const [direction, setDirection] = useState<Direction>('buy');
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [customSlippage, setCustomSlippage] = useState('');

  const [quote, setQuote] = useState<{ out: string; min: string; progress?: number } | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [migrated, setMigrated] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);

  const inDecimals = decimalsFor(direction, 'in');
  const outDecimals = decimalsFor(direction, 'out');
  const inSymbol = direction === 'buy' ? 'SOL' : `$${ticker}`;
  const outSymbol = direction === 'buy' ? `$${ticker}` : 'SOL';

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setAmount('');
      setQuote(null);
      setPhase('idle');
      setError(null);
      setMigrated(false);
      setTxSig(null);
    }
  }, [open]);

  // Debounced quote fetch.
  const quoteSeqRef = useRef(0);
  useEffect(() => {
    setQuote(null);
    setError(null);
    setMigrated(false);
    if (!open) return;
    const baseUnits = toBaseUnits(amount, inDecimals);
    if (!baseUnits) return;

    const seq = ++quoteSeqRef.current;
    setPhase('quoting');
    const handle = setTimeout(async () => {
      try {
        const res = await fetch('/api/tokens/swap/quote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            tokenMint,
            direction,
            amountIn: baseUnits,
            slippageBps,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as QuoteResponse;
        if (seq !== quoteSeqRef.current) return; // stale response
        if (!res.ok) {
          if (data.code === 'pool_migrated') setMigrated(true);
          setError(data.error ?? `Quote failed (${res.status})`);
          setPhase('idle');
          return;
        }
        setQuote({ out: data.amountOut, min: data.minimumAmountOut, progress: data.curveProgress });
        setPhase('idle');
      } catch (e) {
        if (seq !== quoteSeqRef.current) return;
        setError(e instanceof Error ? e.message : 'Quote failed');
        setPhase('idle');
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [open, amount, direction, slippageBps, tokenMint, inDecimals]);

  if (!open) return null;

  // 5% is the documented MEV-risk line, so include it in the warning rather
  // than only flagging values strictly above it.
  const slippageWarn = slippageBps >= 500;
  const isBusy =
    phase === 'building' || phase === 'signing' || phase === 'submitting' || phase === 'confirming';
  const baseUnitsIn = toBaseUnits(amount, inDecimals);
  const canSubmit =
    !isBusy &&
    !migrated &&
    !!quote &&
    !!baseUnitsIn &&
    connected &&
    signedIn &&
    !!publicKey &&
    !!signTransaction;

  async function handleSwap() {
    if (!publicKey || !signTransaction || !baseUnitsIn) return;
    setError(null);
    setPhase('building');
    try {
      const buildRes = await fetch('/api/tokens/swap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tokenMint,
          direction,
          amountIn: baseUnitsIn,
          slippageBps,
        }),
      });
      const data = (await buildRes.json().catch(() => ({}))) as SwapResponse;
      if (!buildRes.ok) {
        if (data.code === 'pool_migrated') setMigrated(true);
        throw new Error(data.error ?? `Build failed (${buildRes.status})`);
      }

      const txBytes = Uint8Array.from(Buffer.from(data.serializedTx, 'base64'));
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
      const confirmation = await conn.confirmTransaction(
        { signature: sig, blockhash: data.blockhash, lastValidBlockHeight: data.lastValidBlockHeight },
        'confirmed',
      );
      if (confirmation.value.err) {
        throw new Error(`On-chain failure: ${JSON.stringify(confirmation.value.err)}`);
      }

      setTxSig(sig);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Swap failed');
      setPhase('error');
    }
  }

  function flipDirection() {
    // Bump the quote-seq so any in-flight response for the old direction is
    // dropped before it can flash the wrong amount-out into the receive slot.
    quoteSeqRef.current++;
    setDirection((d) => (d === 'buy' ? 'sell' : 'buy'));
    setAmount('');
    setQuote(null);
  }

  function applyCustomSlippage() {
    const pct = parseFloat(customSlippage);
    if (!isFinite(pct) || pct < 0 || pct > 50) return;
    setSlippageBps(Math.round(pct * 100));
  }

  const phaseLabel: Record<Phase, string> = {
    idle: quote ? `Swap ${inSymbol} → ${outSymbol}` : 'Enter an amount',
    quoting: 'Fetching quote…',
    building: 'Preparing transaction…',
    signing: 'Approve in wallet…',
    submitting: 'Submitting to Solana…',
    confirming: 'Waiting for confirmation…',
    done: 'Done',
    error: 'Try again',
  };

  const explorerUrl = txSig
    ? `https://solscan.io/tx/${txSig}${cluster === 'devnet' ? '?cluster=devnet' : ''}`
    : null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isBusy) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#13141a] p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Trade ${ticker}</h2>
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
            <p className="text-white font-medium">Swap confirmed</p>
            {explorerUrl && (
              <Link
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70"
              >
                View on Solscan <ExternalLink className="h-3 w-3" />
              </Link>
            )}
            <button
              onClick={onClose}
              className="mt-5 w-full rounded-xl bg-[#8b7ec8] py-2.5 text-sm font-semibold text-white hover:bg-[#7a6db8]"
            >
              Continue
            </button>
          </div>
        ) : migrated ? (
          <div className="py-4 text-center">
            <p className="mb-4 text-sm text-white/70">
              This pool has graduated to DAMM. In-app swap is no longer available — trade
              on Meteora instead.
            </p>
            <Link
              href={meteoraFallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#c9a96e] px-4 py-2.5 text-sm font-semibold text-[#13141a] hover:bg-[#b89757]"
            >
              Trade on Meteora <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <>
            {/* Direction tabs */}
            <div className="mb-4 grid grid-cols-2 rounded-lg border border-white/[0.08] p-1 text-xs font-medium">
              <button
                onClick={() => setDirection('buy')}
                disabled={isBusy}
                className={`rounded-md px-3 py-2 transition-colors ${
                  direction === 'buy' ? 'bg-emerald-500/15 text-emerald-300' : 'text-white/50 hover:text-white/80'
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setDirection('sell')}
                disabled={isBusy}
                className={`rounded-md px-3 py-2 transition-colors ${
                  direction === 'sell' ? 'bg-rose-500/15 text-rose-300' : 'text-white/50 hover:text-white/80'
                }`}
              >
                Sell
              </button>
            </div>

            {/* Amount in */}
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-widest text-white/40">
                <span>You pay</span>
                <span className="font-mono">{inSymbol}</span>
              </div>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                disabled={isBusy}
                className="w-full bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-white/20 disabled:opacity-60"
              />
            </div>

            <button
              onClick={flipDirection}
              disabled={isBusy}
              className="mx-auto -my-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-[#13141a] text-white/60 hover:text-white"
              aria-label="Flip direction"
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
            </button>

            {/* Amount out */}
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-widest text-white/40">
                <span>You receive (est.)</span>
                <span className="font-mono">{outSymbol}</span>
              </div>
              <div className="text-2xl font-semibold text-white/80">
                {phase === 'quoting' ? (
                  <span className="text-white/30">…</span>
                ) : quote ? (
                  fromBaseUnits(quote.out, outDecimals)
                ) : (
                  <span className="text-white/20">0.0</span>
                )}
              </div>
              {quote && (
                <p className="mt-1 text-[10px] text-white/40">
                  Min after slippage: {fromBaseUnits(quote.min, outDecimals)} {outSymbol}
                </p>
              )}
            </div>

            {/* Slippage */}
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-widest text-white/40">
                <span>Slippage</span>
                <span className="font-mono text-white/60">{(slippageBps / 100).toFixed(2)}%</span>
              </div>
              <div className="flex gap-1.5">
                {SLIPPAGE_PRESETS.map((bps) => (
                  <button
                    key={bps}
                    onClick={() => setSlippageBps(bps)}
                    disabled={isBusy}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      slippageBps === bps
                        ? 'border-[#8b7ec8]/40 bg-[#8b7ec8]/10 text-white'
                        : 'border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-white/80'
                    }`}
                  >
                    {bps / 100}%
                  </button>
                ))}
                <input
                  inputMode="decimal"
                  placeholder="custom"
                  value={customSlippage}
                  onChange={(e) => setCustomSlippage(e.target.value)}
                  onBlur={applyCustomSlippage}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyCustomSlippage();
                  }}
                  disabled={isBusy}
                  className="w-20 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-xs text-white outline-none focus:border-[#8b7ec8]/40 placeholder:text-white/25"
                />
              </div>
              {slippageWarn && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-amber-300">
                  <AlertCircle className="h-3 w-3" /> High slippage — risk of MEV.
                </p>
              )}
            </div>

            {(!signedIn || !connected) && (
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <AlertCircle className="h-3.5 w-3.5" />
                {!signedIn ? 'Sign in first.' : 'Connect your wallet.'}
              </p>
            )}

            <button
              onClick={handleSwap}
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
