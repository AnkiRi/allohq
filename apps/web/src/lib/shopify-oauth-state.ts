import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Shopify's permission screen can sit open while a merchant reads it. A
// ten-minute window failed legitimate installs with invalid_state.
const OAUTH_STATE_TTL_MS = 30 * 60_000;
type StatePayload = { nonce: string; userId: string; shop: string; issuedAt: number };

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function equals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Mint the CSRF state for a Shopify install.
 *
 * The signed token travels in Shopify's `state` parameter, which Shopify
 * echoes back verbatim, so an install still completes in a browser that drops
 * the cookie on the cross-site return. The cookie carries the same value as a
 * second copy and must match whenever it survives.
 */
export function createShopifyOAuthState(
  userId: string,
  shop: string,
  secret: string,
  now = Date.now(),
) {
  const nonce = randomBytes(16).toString("hex");
  const payload = Buffer.from(
    JSON.stringify({
      nonce,
      userId,
      shop: shop.toLowerCase(),
      issuedAt: now,
    } satisfies StatePayload),
  ).toString("base64url");
  const token = `${payload}.${signature(payload, secret)}`;
  return { state: token, cookie: token };
}

export function verifyShopifyOAuthState(
  cookie: string | undefined,
  returnedState: string | null,
  secret: string,
  options: { shop?: string; now?: number } = {},
) {
  const now = options.now ?? Date.now();
  if (!returnedState) return null;

  // A cookie that disagrees with the returned state means tampering rather
  // than a dropped cookie, so reject it. An absent cookie is tolerated.
  if (cookie && !equals(cookie, returnedState)) return null;

  const [payload, suppliedSignature, extra] = returnedState.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  if (!equals(suppliedSignature, signature(payload, secret))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as StatePayload;
    if (
      typeof parsed.userId !== "string" || !parsed.userId ||
      typeof parsed.nonce !== "string" || !parsed.nonce ||
      typeof parsed.shop !== "string" || !parsed.shop ||
      typeof parsed.issuedAt !== "number" ||
      parsed.issuedAt > now + 30_000 ||
      now - parsed.issuedAt > OAUTH_STATE_TTL_MS
    ) return null;

    // Bind the state to the shop it was issued for: a leaked state must not be
    // replayable to attach a different shop to this Joon account.
    if (options.shop && parsed.shop !== options.shop.toLowerCase()) return null;

    return parsed.userId;
  } catch {
    return null;
  }
}
