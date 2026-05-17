/**
 * In-memory IP rate limiter. Cheap, per-instance, resets on cold start.
 * Adequate for keeping casual abuse + accidental floods off public endpoints.
 *
 * For real DDoS protection, put this behind Vercel's WAF / Cloudflare instead.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Map<string, Bucket>>();

export interface RateLimitResult {
  ok: boolean;
  /** Seconds the caller should wait before retrying. */
  retryAfter: number;
}

/**
 * Check if `ip` may proceed under `bucket`. Returns ok=true and updates the
 * bucket if within the window; ok=false with retryAfter otherwise.
 *
 * @param bucket   Logical key — different endpoints get independent budgets.
 * @param ip       Client IP. Pull from `request.headers.get('x-forwarded-for')`.
 * @param max      Max requests per window.
 * @param windowMs Window length in ms.
 */
export function checkRateLimit(
  bucket: string,
  ip: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  let bucketMap = buckets.get(bucket);
  if (!bucketMap) {
    bucketMap = new Map();
    buckets.set(bucket, bucketMap);
  }

  const existing = bucketMap.get(ip);
  if (!existing || existing.resetAt <= now) {
    bucketMap.set(ip, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  if (existing.count >= max) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { ok: true, retryAfter: 0 };
}

/** Convenience: pull the client IP from a Request, falling back to 'unknown'. */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
