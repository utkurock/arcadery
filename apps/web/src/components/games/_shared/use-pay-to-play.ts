'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionExpiredBlockheightExceededError,
} from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useModals } from '@/lib/ui/modals';
import {
  BUILTIN_ENTRY_FEE_LAMPORTS,
  BUILTIN_ENTRY_FEE_SOL,
  publicTreasuryAddress,
  type BuiltinGameKey,
} from '@/lib/builtin-games/config';

// Headless controller for the pay-to-play flow. Extracted from the original
// `EntryGate` modal so each builtin game can render its own immersive intro
// screen (themed background, hero text, CTA) without duplicating the SOL
// transfer, on-chain confirmation, and server-side verify logic.
//
// Phases mirror the original modal:
//   idle      — ready for the user to act
//   building  — fetching blockhash + building the tx
//   signing   — wallet popup is showing
//   confirming — tx submitted, waiting on cluster confirmation
//   verifying — confirmed; asking our server to verify the transfer
//   error     — something failed; controller exposes the message
//
// Dev/bypass mode: if NEXT_PUBLIC_TREASURY_WALLET is missing or the all-zero
// sentinel, the hook auto-enters the moment the wallet connects (mirrors the
// server-side bypass in `/api/games/[game]/entry`).

export interface PayToPlayContext {
  wallet: string;
  entrySignature: string | null;
}

export type PayPhase =
  | 'idle'
  | 'building'
  | 'signing'
  | 'confirming'
  | 'verifying'
  | 'error';

export interface PayToPlayController {
  phase: PayPhase;
  error: string | null;
  connected: boolean;
  walletAddress: string | null;
  /** Treasury PublicKey if configured, null in dev/bypass mode. */
  treasury: PublicKey | null;
  /** Per-tx fee in SOL — surface in copy so each game can show "play for X". */
  feeSol: number;
  isBusy: boolean;
  /** True after the user has paid AND we received confirmation. */
  succeeded: boolean;
  /** Triggers the pay flow. If wallet not connected, opens the login modal. */
  enter: () => Promise<void>;
  /** Clears the current error so the user can retry. */
  clearError: () => void;
}

export function usePayToPlay(params: {
  gameKey: BuiltinGameKey;
  onEntered: (ctx: PayToPlayContext) => void;
}): PayToPlayController {
  const { gameKey, onEntered } = params;
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [phase, setPhase] = useState<PayPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const treasury = useMemo(() => {
    const raw = publicTreasuryAddress();
    if (!raw) return null;
    try {
      return new PublicKey(raw);
    } catch {
      return null;
    }
  }, []);

  // Dev/bypass: no treasury configured → drop the player straight in once
  // their wallet connects. Mirror of the server route bypass.
  useEffect(() => {
    if (!treasury && connected && publicKey && !succeeded) {
      setSucceeded(true);
      onEntered({ wallet: publicKey.toBase58(), entrySignature: null });
    }
  }, [treasury, connected, publicKey, onEntered, succeeded]);

  const isBusy =
    phase === 'building' ||
    phase === 'signing' ||
    phase === 'confirming' ||
    phase === 'verifying';

  const enter = async (): Promise<void> => {
    if (!connected || !publicKey || !sendTransaction) {
      useModals.getState().openLogin();
      return;
    }
    if (!treasury) {
      setError('Treasury wallet not configured');
      setPhase('error');
      return;
    }
    setError(null);
    setPhase('building');
    try {
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      const tx = new Transaction({
        feePayer: publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: treasury,
          lamports: BUILTIN_ENTRY_FEE_LAMPORTS,
        }),
      );

      setPhase('signing');
      const signature = await sendTransaction(tx, connection);

      setPhase('confirming');
      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      );
      if (confirmation.value.err) {
        throw new Error(
          `On-chain failure: ${JSON.stringify(confirmation.value.err)}`,
        );
      }

      setPhase('verifying');
      const res = await fetch(`/api/games/${gameKey}/entry`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signature, wallet: publicKey.toBase58() }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || 'Server rejected entry');
      }

      setSucceeded(true);
      onEntered({
        wallet: publicKey.toBase58(),
        entrySignature: signature,
      });
    } catch (err) {
      if (err instanceof TransactionExpiredBlockheightExceededError) {
        setError('Transaction expired — please try again.');
      } else {
        const m = err instanceof Error ? err.message : 'Entry failed';
        setError(m.length > 200 ? m.slice(0, 200) + '…' : m);
      }
      setPhase('error');
    }
  };

  return {
    phase,
    error,
    connected,
    walletAddress: publicKey ? publicKey.toBase58() : null,
    treasury,
    feeSol: BUILTIN_ENTRY_FEE_SOL,
    isBusy,
    succeeded,
    enter,
    clearError: () => {
      setError(null);
      setPhase('idle');
    },
  };
}

export function shortenWallet(addr: string | null | undefined): string {
  if (!addr) return '';
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}
