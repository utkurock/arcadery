import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { NONCE_COOKIE, NONCE_TTL_SECONDS } from '@/lib/auth/siws-message';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  // Sign-in is public — rate-limit per IP to prevent nonce-cookie churn.
  const rl = checkRateLimit('auth:nonce', clientIp(request), 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many sign-in attempts. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => null)) as { publicKey?: string } | null;
  const publicKey = body?.publicKey?.trim();
  if (!publicKey || publicKey.length < 32 || publicKey.length > 64) {
    return NextResponse.json({ error: 'Invalid publicKey' }, { status: 400 });
  }

  const nonce = randomBytes(24).toString('hex');
  const issuedAt = new Date().toISOString();

  const cookieStore = await cookies();
  cookieStore.set(NONCE_COOKIE, JSON.stringify({ nonce, publicKey, issuedAt }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: NONCE_TTL_SECONDS,
  });

  return NextResponse.json({ nonce, issuedAt });
}
