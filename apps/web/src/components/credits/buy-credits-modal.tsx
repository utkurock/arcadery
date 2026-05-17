'use client';

import { useState, useEffect, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  Transaction,
  TransactionExpiredBlockheightExceededError,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
} from '@solana/spl-token';
import { X, Loader2, Check, Coins, Sparkles } from 'lucide-react';
import { useCredits } from '@/lib/credits/context';
import { PRICING_TIERS, USDC_DECIMALS, defaultUsdcMintForCluster, type PricingTier } from '@/lib/credits/config';
import { useScrollLock } from '@/lib/ui/use-scroll-lock';

type Phase = 'idle' | 'building' | 'signing' | 'confirming' | 'verifying' | 'done' | 'error';

export function BuyCreditsModal() {
  const { isBuyModalOpen, closeBuyModal, setBalance, signedIn, refresh } = useCredits();
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<PricingTier>(PRICING_TIERS[1]);
  const [grantedCredits, setGrantedCredits] = useState<number | null>(null);

  useScrollLock(isBuyModalOpen);

  useEffect(() => {
    if (!isBuyModalOpen) {
      setPhase('idle');
      setError(null);
      setGrantedCredits(null);
      setSelectedTier(PRICING_TIERS[1]);
      return;
    }
    // On open, refresh balance so the user sees the truth before paying — the
    // context's cached value may be stale if credits were spent in another tab
    // or refunded server-side since this provider mounted.
    refresh().catch(() => {});
  }, [isBuyModalOpen, refresh]);

  // Escape to close, but not while a tx is mid-flight (closing would orphan
  // the on-chain submission/confirmation work).
  useEffect(() => {
    if (!isBuyModalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const isBusy =
        phase === 'building' ||
        phase === 'signing' ||
        phase === 'confirming' ||
        phase === 'verifying';
      if (isBusy) return;
      closeBuyModal();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isBuyModalOpen, phase, closeBuyModal]);

  const treasuryRaw = process.env.NEXT_PUBLIC_TREASURY_WALLET;
  const mintRaw =
    process.env.NEXT_PUBLIC_USDC_MINT ||
    defaultUsdcMintForCluster(process.env.NEXT_PUBLIC_SOLANA_CLUSTER);
  const treasuryConfigured = !!treasuryRaw && treasuryRaw !== '11111111111111111111111111111111';

  const addresses = useMemo(() => {
    if (!treasuryConfigured) return null;
    try {
      return {
        treasury: new PublicKey(treasuryRaw!),
        mint: new PublicKey(mintRaw),
      };
    } catch {
      return null;
    }
  }, [treasuryConfigured, treasuryRaw, mintRaw]);

  if (!isBuyModalOpen) return null;

  async function handleBuy() {
    if (!signedIn) {
      setError('Sign in first');
      setPhase('error');
      return;
    }
    if (!connected || !publicKey || !sendTransaction) {
      setError('Connect your wallet first');
      setPhase('error');
      return;
    }
    if (!addresses) {
      setError('Treasury or USDC mint not configured');
      setPhase('error');
      return;
    }

    // Snapshot the tier at the start of the flow so a later tier swap (which
    // is gated on `isBusy` but can race a render) can't make the on-chain
    // amount disagree with the tierId we POST to /api/credits/purchase.
    const tier = selectedTier;

    setError(null);
    setPhase('building');

    try {
      const userAta = getAssociatedTokenAddressSync(addresses.mint, publicKey);
      const treasuryAta = getAssociatedTokenAddressSync(addresses.mint, addresses.treasury);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({
        feePayer: publicKey,
        blockhash,
        lastValidBlockHeight,
      });

      // Safety: create treasury ATA if it doesn't exist yet (idempotent, ~0.002 SOL rent on first create).
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey, // payer
          treasuryAta,
          addresses.treasury,
          addresses.mint,
        ),
      );

      tx.add(
        createTransferCheckedInstruction(
          userAta,
          addresses.mint,
          treasuryAta,
          publicKey,
          BigInt(tier.usdcAmount),
          USDC_DECIMALS,
        ),
      );

      setPhase('signing');
      const signature = await sendTransaction(tx, connection);

      setPhase('confirming');
      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      );
      if (confirmation.value.err) {
        const errStr = JSON.stringify(confirmation.value.err);
        if (errStr.includes('0x1') || errStr.includes('InsufficientFunds')) {
          throw new Error('Not enough USDC in your wallet.');
        }
        throw new Error(`On-chain failure: ${errStr}`);
      }

      setPhase('verifying');
      const res = await fetch('/api/credits/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signature, tierId: tier.id }),
      });
      if (!res.ok) {
        const { error: serverErr } = await res.json().catch(() => ({ error: 'Server rejected' }));
        throw new Error(serverErr || 'Server rejected');
      }
      const data = (await res.json()) as {
        balance: number;
        creditsGranted: number;
        alreadyCredited?: boolean;
      };

      setBalance(data.balance);
      setGrantedCredits(data.creditsGranted);
      setPhase('done');
    } catch (err) {
      if (err instanceof TransactionExpiredBlockheightExceededError) {
        setError('Transaction expired — please try again.');
      } else {
        const m = err instanceof Error ? err.message : 'Purchase failed';
        if (/TokenAccountNotFound|could not find account/i.test(m)) {
          setError('No USDC in this wallet. Swap some SOL → USDC first.');
        } else {
          setError(m);
        }
      }
      setPhase('error');
    }
  }

  const isBusy = phase === 'building' || phase === 'signing' || phase === 'confirming' || phase === 'verifying';
  const phaseLabel: Record<Phase, string> = {
    idle: `Pay ${selectedTier.usdLabel}`,
    building: 'Preparing…',
    signing: 'Approve in wallet…',
    confirming: 'Waiting for confirmation…',
    verifying: 'Granting credits…',
    done: 'Done',
    error: 'Try again',
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#13141a] p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-[#8b7ec8]" />
            <h2 className="text-lg font-semibold text-white">Top up credits</h2>
          </div>
          <button
            onClick={closeBuyModal}
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
            <p className="text-white font-medium">
              {grantedCredits === 0 ? 'Purchase already credited' : `+${grantedCredits} credits`}
            </p>
            <p className="text-white/50 text-xs mt-1">Your balance has been updated.</p>
            <button
              onClick={closeBuyModal}
              className="mt-5 w-full rounded-xl bg-[#8b7ec8] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#7a6db8]"
            >
              Continue
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {PRICING_TIERS.map((tier) => {
                const isSelected = tier.id === selectedTier.id;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => !isBusy && setSelectedTier(tier)}
                    disabled={isBusy}
                    className={`relative rounded-xl border p-4 text-left transition-colors disabled:opacity-60 ${
                      isSelected
                        ? 'border-[#8b7ec8] bg-[#8b7ec8]/10'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                    }`}
                  >
                    {tier.badge && (
                      <span className="absolute -top-2 right-2 flex items-center gap-0.5 rounded-full bg-[#8b7ec8] px-2 py-0.5 text-[10px] font-semibold text-white">
                        <Sparkles className="h-2.5 w-2.5" />
                        {tier.badge}
                      </span>
                    )}
                    <div className="text-[11px] uppercase tracking-wider text-white/50">
                      {tier.label}
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-xl font-bold text-white">{tier.credits}</span>
                      <span className="text-xs text-white/50">credits</span>
                    </div>
                    <div className="mt-2 text-sm font-mono text-white">{tier.usdLabel}</div>
                    <div className="mt-0.5 text-[10px] text-white/40">
                      ${tier.perCreditUsd.toFixed(2)} / credit
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 mb-4">
              <p className="text-[11px] text-white/50 leading-relaxed">
                Paid in <span className="text-white/80 font-medium">USDC</span> on Solana. Each
                AI generation spends 1 credit. Failed generations are auto-refunded.
              </p>
            </div>

            {!treasuryConfigured && (
              <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Treasury wallet not set — configure <code>NEXT_PUBLIC_TREASURY_WALLET</code>.
              </p>
            )}
            {!connected && (
              <p className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
                Connect a Solana wallet to pay.
              </p>
            )}

            <button
              onClick={handleBuy}
              disabled={isBusy || !connected || !signedIn || !addresses}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#8b7ec8] py-3 text-sm font-semibold text-white hover:bg-[#7a6db8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {phaseLabel[phase]}
            </button>

            {error && (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
