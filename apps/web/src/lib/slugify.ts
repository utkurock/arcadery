import { RESERVED_SUBDOMAINS } from '@/lib/published/subdomain';

/**
 * Generate a URL-safe slug from a name with a random suffix for uniqueness.
 *
 * The published-game slug doubles as a subdomain label
 * (`<slug>.arcadery.xyz`), so we defend against the slug being a reserved
 * platform label. The 6-char suffix already makes a collision practically
 * impossible — this is defence in depth and also normalises pathological
 * inputs like an empty name (which would otherwise emit `-abc123`).
 */
export function generateSlug(name: string): string {
  let base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  if (!base) base = 'game';
  // A bare reserved word ('admin', 'api', …) would, post-suffix, be
  // `admin-abc123` — the *full slug* isn't reserved, but the base prefix
  // looks like a platform label to a human reading the URL. Prefix-shift
  // it so the share URL reads naturally.
  if (RESERVED_SUBDOMAINS.has(base)) base = `game-${base}`;

  const suffix = crypto.randomUUID().slice(0, 6);
  return `${base}-${suffix}`;
}

/**
 * Deterministic slug for fixed names — same input always produces the same
 * output. Used for routes like /template/<name> where we look the entry up
 * by slugifying its name on both ends instead of storing a separate slug
 * column. Parens and other punctuation collapse to a single dash.
 */
export function staticSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
