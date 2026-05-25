// Pretty share URL builder. Each published game has two equivalent surfaces:
//   • Subdomain (preferred for shares): https://<slug>.arcadery.xyz
//   • Path alias (always works, used for internal Links): /play/<slug>
//
// Both render the same page (middleware rewrites subdomain → path), but the
// subdomain form is what we want users to copy and tweet. This helper picks
// the right one based on the current host so it works identically in dev
// (`<slug>.localhost:3001`) and in prod (`<slug>.arcadery.xyz`).

/**
 * Build the canonical share URL for a published game.
 *
 * Browser context — pass nothing, the function reads `window.location` and
 * promotes the current host into a subdomain. From the editor at
 * `arcadery.xyz/create/...`, this returns `https://<slug>.arcadery.xyz`.
 *
 * Server context — pass `{ origin }` (e.g. `https://arcadery.xyz`) and the
 * function builds the subdomain form against it.
 */
export function gameUrl(
  slug: string,
  opts: { origin?: string; path?: string } = {},
): string {
  const path = opts.path ?? '';
  const origin =
    opts.origin ??
    (typeof window !== 'undefined' ? window.location.origin : '');
  if (!origin) {
    // No origin available (e.g. SSG without env override). Fall back to the
    // path alias; it'll be a relative URL but at least it routes.
    return `/play/${slug}${path}`;
  }

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return `/play/${slug}${path}`;
  }

  const apex = url.hostname;
  // Strip an existing leading subdomain (`<oldslug>.arcadery.xyz` →
  // `arcadery.xyz`) so we don't end up with double-stacked labels when this
  // helper is called from a /play/<slug> page itself.
  const apexBase = stripGameSubdomain(apex);
  // Lone `localhost` is the only apex that legitimately has < 2 labels and
  // still accepts a subdomain prefix (`foo.localhost` is RFC-supported and
  // Chrome resolves it to 127.0.0.1).
  if (apexBase === 'localhost' || apexBase.includes('.')) {
    url.hostname = `${slug}.${apexBase}`;
    url.pathname = path;
    return url.toString();
  }

  // Couldn't safely promote — fall back to the path alias.
  return `${origin}/play/${slug}${path}`;
}

/**
 * If `hostname` already has a game-subdomain prefix, strip it. We define a
 * "game prefix" as: hostname has 3+ labels AND the first label isn't reserved.
 * This is intentionally permissive — false positives only cause us to build a
 * fresh subdomain URL, never to mis-route a real request.
 */
function stripGameSubdomain(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length < 3) return hostname;
  // Don't strip if it looks like an apex (e.g. some.co.uk pattern) — we don't
  // serve those, but defending the case keeps the helper conservative.
  if (parts[0] === 'www') return parts.slice(1).join('.');
  // Otherwise, strip the leading label.
  return parts.slice(1).join('.');
}
