import type { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { createClient } from '@/lib/supabase/client';
import { buildSiwsMessage } from './siws-message';

type SignMessage = (message: Uint8Array) => Promise<Uint8Array>;

export const SIGNED_IN_BEFORE_KEY = 'arcadery_signed_in_before';

export type SiwsResult = {
  isNewUser: boolean;
  welcomeGranted: boolean;
};

export async function signInWithSolana(args: {
  publicKey: PublicKey;
  signMessage: SignMessage;
}): Promise<SiwsResult> {
  const address = args.publicKey.toBase58();

  const nonceRes = await fetch('/api/auth/solana/nonce', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ publicKey: address }),
  });
  if (!nonceRes.ok) throw new Error('Failed to get nonce');
  const { nonce, issuedAt } = (await nonceRes.json()) as {
    nonce: string;
    issuedAt: string;
  };

  const message = buildSiwsMessage({ publicKey: address, nonce, issuedAt });
  const signatureBytes = await args.signMessage(new TextEncoder().encode(message));
  const signature = bs58.encode(signatureBytes);

  const verifyRes = await fetch('/api/auth/solana/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ publicKey: address, signature, issuedAt }),
  });
  if (!verifyRes.ok) {
    const { error } = await verifyRes.json().catch(() => ({ error: 'Verification failed' }));
    throw new Error(error || 'Verification failed');
  }
  const {
    accessToken,
    refreshToken,
    isNewUser = false,
    welcomeGranted = false,
  } = (await verifyRes.json()) as {
    accessToken: string;
    refreshToken: string;
    isNewUser?: boolean;
    welcomeGranted?: boolean;
  };

  // The verify route already set auth cookies on the response, so the next
  // request is authed. Sync the in-memory browser client too so it fires
  // SIGNED_IN for subscribers (LoginModal closes, useViewer flips).
  const supabase = createClient();
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw new Error(error.message);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SIGNED_IN_BEFORE_KEY, '1');
    }
  } catch {}

  return { isNewUser, welcomeGranted };
}
