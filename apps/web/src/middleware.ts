import { type NextRequest } from 'next/server';
import { updateSession, updateSessionWithRewrite } from '@/lib/supabase/middleware';
import { extractGameSlug, isSubdomainPassthrough } from '@/lib/published/subdomain';

/**
 * Two responsibilities, both run on every request that survives the matcher
 * below:
 *
 *   1. Touch Supabase session so auth cookies stay fresh for SSR + RSC.
 *   2. If the request arrived on a game subdomain (`<slug>.arcadery.xyz`),
 *      transparently rewrite it to `/play/<slug>/<path>` so the published
 *      game page renders without any client-side redirect.
 *
 * Subdomain handling is internal-only. API routes and Next-served assets
 * still resolve at their literal paths (e.g. `<slug>.arcadery.xyz/api/...`
 * hits `/api/...`), so the beacon and other client fetches Just Work.
 */
export async function middleware(request: NextRequest) {
  const slug = extractGameSlug(request.headers.get('host'));
  if (slug && !isSubdomainPassthrough(request.nextUrl.pathname)) {
    const rewriteUrl = request.nextUrl.clone();
    const original = rewriteUrl.pathname === '/' ? '' : rewriteUrl.pathname;
    rewriteUrl.pathname = `/play/${slug}${original}`;
    return updateSessionWithRewrite(request, rewriteUrl);
  }
  return updateSession(request);
}

export const config = {
  // Skip Next internals and static assets — auth cookies don't matter for them.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
