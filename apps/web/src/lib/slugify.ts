/**
 * Generate a URL-safe slug from a name with a random suffix for uniqueness.
 */
export function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);

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
