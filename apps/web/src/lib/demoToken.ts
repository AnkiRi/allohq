// Private /try demo access tokens.
//
// The public demo has NO public front door — it's reachable only via tokenized
// links the user hands out (allohq.ai/try/<token>). Tokens are env-driven
// (DEMO_ACCESS_TOKENS, comma-separated) so they can be added/revoked without a
// code change. The token gates the demo-guest at the EDGE (middleware) — but the
// endpoint's hard guards (write-floor, cost caps, injection scoping, cross-tenant
// IDOR) protect the data regardless, so the token is access-control, not the only
// defense.
//
// This module is plain TS (no Node APIs) so it can be imported by Edge middleware.

export const DEMO_COOKIE = "allo_demo_token";

export function getValidDemoTokens(): Set<string> {
  const raw =
    process.env.DEMO_ACCESS_TOKENS ??
    // Dev-only convenience token so /try works locally without env setup. NEVER
    // a fallback in production — there, an unset list means no valid tokens.
    (process.env.NODE_ENV !== "production" ? "demo-dev" : "");
  return new Set(
    raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );
}

export function isValidDemoToken(token: string | undefined | null): boolean {
  if (!token) return false;
  return getValidDemoTokens().has(token);
}
