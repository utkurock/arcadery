// Subdomain routing for published games. Lives separate from the Next.js
// middleware so it stays unit-testable and the share-URL builder can reuse
// the same source of truth for reserved names.
//
// The "primary domain" is whatever the deployment serves the apex from
// (arcadery.xyz in prod, localhost in dev). Anything else that's a single
// host-label deeper — e.g. `cube-runner.arcadery.xyz`, `cube-runner.localhost`
// — is a game subdomain. We extract the leading label, check it's not on the
// reserved list, and pass it through as the slug for the rewrite.

/**
 * Host labels that may never be a game slug. Includes:
 *   - product routes already mounted at the apex (admin, api, …)
 *   - any name that could plausibly be a future apex sibling (staging, dev, …)
 *   - common infra labels (www, mail, …) so we never accidentally rewrite an
 *     ops subdomain
 *
 * generateSlug() already appends a 6-char random suffix, so a real collision
 * is practically impossible — this list is defence in depth, not correctness.
 */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  // Product routes
  'admin',
  'api',
  'app',
  'auth',
  'account',
  'create',
  'dashboard',
  'docs',
  'earnings',
  'explore',
  'play',
  'profile',
  'settings',
  'template',
  'templates',
  'tokens',
  // Marketing / generic
  'www',
  'home',
  'about',
  'blog',
  'landing',
  // Infra
  'cdn',
  'static',
  'assets',
  'media',
  'mail',
  'email',
  'ftp',
  'ssh',
  'vpn',
  'staging',
  'dev',
  'test',
  'preview',
]);

/**
 * Extracts a game slug from the request Host header. Returns null if:
 *   - the request is for the apex (`arcadery.xyz`, `localhost`)
 *   - the first label is reserved
 *   - the host is something we don't recognise (IP literal, single-label,
 *     Vercel preview URLs that we haven't whitelisted yet)
 *
 * Cases we want to accept:
 *   • `cube-runner.arcadery.xyz`         → 'cube-runner'
 *   • `cube-runner.staging.arcadery.xyz` → 'cube-runner'  (staging environment)
 *   • `cube-runner.localhost:3001`       → 'cube-runner'  (local dev)
 *
 * Cases we explicitly reject:
 *   • `arcadery.xyz`        → null  (apex)
 *   • `www.arcadery.xyz`    → null  (reserved)
 *   • `localhost:3001`      → null  (single-label apex)
 *   • `127.0.0.1:3001`      → null  (IP literal)
 */
export function extractGameSlug(host: string | null): string | null {
  if (!host) return null;
  // Strip port and lowercase. Host headers are usually already lowercase, but
  // the spec allows mixed case and some proxies don't normalise.
  const hostname = host.split(':')[0].toLowerCase();

  // Reject IPv4 / IPv6 literals — no subdomain semantics there. (IPv4 will
  // hit the digit-only first label check; IPv6 inside brackets has colons we
  // already stripped, but bracket-stripping is overkill for our actual
  // traffic.)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;

  const parts = hostname.split('.');
  if (parts.length < 2) return null; // bare 'localhost'

  const first = parts[0];
  if (!first || RESERVED_SUBDOMAINS.has(first)) return null;
  // Numeric first label looks like an IP fragment, not a slug.
  if (/^\d+$/.test(first)) return null;

  // 2-label host: only `<slug>.localhost` qualifies. Anything else is an apex
  // domain (`arcadery.xyz`) where `parts[0]` is actually the SLD, not a sub.
  if (parts.length === 2) {
    if (parts[1] === 'localhost') return first;
    return null;
  }

  // 3+ labels: first label is always the subdomain.
  return first;
}

/**
 * True for paths the subdomain rewrite should pass through unchanged. The
 * rewrite turns the game subdomain into a transparent alias for /play/<slug>;
 * that aliasing doesn't apply to API calls, framework-served assets, or
 * paths that are already canonical (`/play/...`). The canonical-path skip
 * keeps the rewrite idempotent — important for OG image URLs Next.js emits
 * which are absolute (`https://<slug>.arcadery.xyz/play/<slug>/opengraph-image`)
 * and would otherwise be rewritten to `/play/<slug>/play/<slug>/opengraph-image`.
 */
export function isSubdomainPassthrough(pathname: string): boolean {
  if (pathname.startsWith('/api/')) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname.startsWith('/_vercel/')) return true;
  if (pathname.startsWith('/play/')) return true;
  if (pathname === '/favicon.ico') return true;
  if (pathname === '/robots.txt') return true;
  if (pathname === '/sitemap.xml') return true;
  return false;
}
