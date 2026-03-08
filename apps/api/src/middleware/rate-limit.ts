/**
 * In-memory sliding-window rate limiter.
 * Simple per-user rate limiting for the tRPC API.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 5 * 60_000).unref();

/**
 * Check if a request should be rate-limited.
 * Returns true if allowed, false if rate-limited.
 */
export function checkRateLimit(
  userId: string,
  opts: { maxRequests?: number; windowMs?: number } = {}
): { allowed: boolean; remaining: number; resetMs: number } {
  const { maxRequests = 100, windowMs = 60_000 } = opts;
  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = store.get(userId);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(userId, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    const oldestInWindow = entry.timestamps[0]!;
    return {
      allowed: false,
      remaining: 0,
      resetMs: oldestInWindow + windowMs - now,
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    resetMs: windowMs,
  };
}
