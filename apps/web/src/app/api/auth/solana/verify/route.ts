import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { buildSiwsMessage, NONCE_COOKIE, NONCE_TTL_SECONDS } from '@/lib/auth/siws-message';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { grantCredits } from '@/lib/credits/server';
import { WELCOME_BONUS } from '@/lib/credits/config';

export const runtime = 'nodejs';

const WALLET_EMAIL_DOMAIN = 'wallet.arcadery.xyz';

type VerifyBody = {
  publicKey?: string;
  signature?: string;
  issuedAt?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as VerifyBody | null;
  if (!body?.publicKey || !body?.signature || !body?.issuedAt) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(NONCE_COOKIE)?.value;
  if (!raw) return NextResponse.json({ error: 'Nonce expired or missing' }, { status: 401 });

  let stored: { nonce: string; publicKey: string; issuedAt: string };
  try {
    stored = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid nonce cookie' }, { status: 401 });
  }

  if (stored.publicKey !== body.publicKey) {
    return NextResponse.json({ error: 'Wallet mismatch' }, { status: 401 });
  }
  if (stored.issuedAt !== body.issuedAt) {
    return NextResponse.json({ error: 'issuedAt mismatch' }, { status: 401 });
  }
  const ageSec = (Date.now() - new Date(stored.issuedAt).getTime()) / 1000;
  if (ageSec > NONCE_TTL_SECONDS || ageSec < -10) {
    return NextResponse.json({ error: 'Nonce expired' }, { status: 401 });
  }

  let pubkeyBytes: Uint8Array;
  try {
    pubkeyBytes = new PublicKey(body.publicKey).toBytes();
  } catch {
    return NextResponse.json({ error: 'Invalid publicKey' }, { status: 400 });
  }

  let sigBytes: Uint8Array;
  try {
    sigBytes = bs58.decode(body.signature);
  } catch {
    return NextResponse.json({ error: 'Invalid signature encoding' }, { status: 400 });
  }

  const message = buildSiwsMessage({
    publicKey: body.publicKey,
    nonce: stored.nonce,
    issuedAt: stored.issuedAt,
  });
  const messageBytes = new TextEncoder().encode(message);

  const valid = nacl.sign.detached.verify(messageBytes, sigBytes, pubkeyBytes);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  cookieStore.delete(NONCE_COOKIE);

  const admin = createAdminClient();
  const email = `${body.publicKey.toLowerCase()}@${WALLET_EMAIL_DOMAIN}`;

  // Provision user if new. Ignore conflict — generateLink below works for existing users too.
  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { wallet_address: body.publicKey, auth_method: 'solana' },
  });
  let isNewUser = Boolean(createData?.user);
  if (createErr) {
    const isConflict =
      createErr.status === 422 ||
      /already|registered|exists/i.test(createErr.message ?? '');
    if (!isConflict) {
      console.error('createUser failed', createErr);
      return NextResponse.json({ error: 'Failed to provision user' }, { status: 500 });
    }
    isNewUser = false;
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr || !linkData?.properties?.hashed_token || !linkData?.user?.id) {
    console.error('generateLink failed', linkErr);
    return NextResponse.json({ error: 'Failed to issue session token' }, { status: 500 });
  }

  await admin
    .from('user_profiles')
    .upsert(
      { id: linkData.user.id, wallet_address: body.publicKey },
      { onConflict: 'id' },
    );

  let welcomeGranted = false;
  if (isNewUser && WELCOME_BONUS > 0) {
    try {
      await grantCredits({
        userId: linkData.user.id,
        amount: WELCOME_BONUS,
        reason: 'welcome',
        metadata: { wallet_address: body.publicKey },
      });
      welcomeGranted = true;
    } catch (err) {
      // Non-fatal: user still gets a session, credits can be granted later.
      // We surface the failure in the response so the client can show a
      // "credits unavailable — contact support" hint instead of silently
      // showing 0 to a brand-new user.
      console.error('welcome bonus grant failed', err);
    }
  }

  // Exchange the hashed token for a session SERVER-SIDE so the @supabase/ssr
  // server client writes the auth cookies via proper `Set-Cookie` response
  // headers (HttpOnly-friendly, Path=/, SameSite=Lax). Doing this on the
  // client via `verifyOtp` from the browser was unreliable: cookies written
  // through `document.cookie` sometimes didn't survive navigations or F5,
  // leaving the user "logged in on the home page" but signed out on /explore
  // or after a refresh. Setting cookies via the response is the canonical
  // Next.js + Supabase pattern and removes that whole class of bug.
  const userSupabase = await createServerSupabase();
  const { data: otpData, error: otpErr } = await userSupabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (otpErr || !otpData.session) {
    console.error('verifyOtp failed', otpErr);
    return NextResponse.json({ error: 'Failed to establish session' }, { status: 500 });
  }

  // Also return the session tokens so the browser client can sync its
  // in-memory state (and fire SIGNED_IN for subscribers) without waiting on
  // a separate network round-trip. The cookies are already set above, so
  // even if the client never calls setSession the next request is authed.
  return NextResponse.json({
    accessToken: otpData.session.access_token,
    refreshToken: otpData.session.refresh_token,
    isNewUser,
    welcomeGranted,
  });
}
