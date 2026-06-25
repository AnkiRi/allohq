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

// ---------------------------------------------------------------------------
// Public-demo cost caps (B2). The demo LLM endpoints are reachable with no
// login, so they need BOTH a per-IP limit (one visitor can't dominate or DoS-by-
// cost) AND a global daily ceiling (a hard bound on total demo spend). When the
// global ceiling is hit the caller gets a graceful "resting" message, never an
// unbounded spend.
// ---------------------------------------------------------------------------

/** Per-IP LLM calls allowed per minute on the public demo. */
const DEMO_IP_PER_MIN = 10;
/**
 * Global LLM calls/day across the WHOLE public demo. Hard money bound: at a
 * conservative ~$0.03–0.05 per call (Claude Sonnet; image-gen disabled on the
 * demo path), 1000/day ≈ a ~$30–50/day ceiling. Tune down for a tighter cap.
 */
const DEMO_GLOBAL_DAILY = 1000;

let demoGlobalDay = "";
let demoGlobalCount = 0;

/**
 * Gate a public-demo LLM/compute call. Returns allowed=false with a reason when
 * the per-IP minute window or the global daily ceiling is exceeded.
 */
export function checkDemoLLMLimit(
  ip: string | null,
): { allowed: boolean; reason: "ip" | "global" | null; globalRemaining: number } {
  // Reset the global counter at each UTC day boundary.
  const day = new Date().toISOString().slice(0, 10);
  if (day !== demoGlobalDay) {
    demoGlobalDay = day;
    demoGlobalCount = 0;
  }
  if (demoGlobalCount >= DEMO_GLOBAL_DAILY) {
    return { allowed: false, reason: "global", globalRemaining: 0 };
  }
  const ipCheck = checkRateLimit(`demo-llm:${ip ?? "unknown"}`, {
    maxRequests: DEMO_IP_PER_MIN,
    windowMs: 60_000,
  });
  if (!ipCheck.allowed) {
    return {
      allowed: false,
      reason: "ip",
      globalRemaining: DEMO_GLOBAL_DAILY - demoGlobalCount,
    };
  }
  demoGlobalCount++;
  return {
    allowed: true,
    reason: null,
    globalRemaining: DEMO_GLOBAL_DAILY - demoGlobalCount,
  };
}
