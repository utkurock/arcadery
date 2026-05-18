import 'server-only';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

// Admin auth: env-driven wallet allowlist. Set `ADMIN_WALLETS` (NOT
// `NEXT_PUBLIC_*` — the list stays server-side) as a comma- or
// whitespace-separated list of base58 Solana addresses. Any signed-in user
// whose `user_profiles.wallet_address` (or auth metadata) matches is treated
// as admin.
//
// Layout + API routes are expected to call `requireAdmin()` first thing and
// branch on the result. Returning a sentinel rather than throwing keeps the
// caller in charge of redirect target ("/explore", a custom 403 page, etc).

export type AdminCheck =
  | { ok: true; userId: string; wallet: string }
  | { ok: false; reason: 'unauthenticated' | 'not_admin' | 'not_configured' };

function parseAllowlist(): Set<string> {
  const raw = process.env.ADMIN_WALLETS ?? '';
  const list = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(list);
}

export async function checkAdmin(): Promise<AdminCheck> {
  const allow = parseAllowlist();
  if (allow.size === 0) {
    return { ok: false, reason: 'not_configured' };
  }
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { ok: false, reason: 'unauthenticated' };

  // Prefer the persisted profile row (canonical), fall back to auth metadata.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('wallet_address')
    .eq('id', user.id)
    .maybeSingle<{ wallet_address: string | null }>();
  const wallet =
    (profile?.wallet_address ?? null) ||
    (user.user_metadata?.wallet_address as string | undefined) ||
    null;

  if (!wallet) return { ok: false, reason: 'not_admin' };
  if (!allow.has(wallet)) return { ok: false, reason: 'not_admin' };
  return { ok: true, userId: user.id, wallet };
}

/** Returns admin context or throws — useful for API routes. */
export async function requireAdminOr403(): Promise<{
  userId: string;
  wallet: string;
}> {
  const check = await checkAdmin();
  if (!check.ok) {
    const err = new Error(check.reason);
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return { userId: check.userId, wallet: check.wallet };
}
