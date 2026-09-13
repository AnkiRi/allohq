import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const OAUTH_STATE_TTL_MS = 10 * 60_000;
type StatePayload = { nonce: string; userId: string; issuedAt: number };

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createShopifyOAuthState(userId: string, secret: string, now = Date.now()) {
  const state = randomBytes(16).toString("hex");
  const payload = Buffer.from(
    JSON.stringify({ nonce: state, userId, issuedAt: now } satisfies StatePayload),
  ).toString("base64url");
  return { state, cookie: `${payload}.${signature(payload, secret)}` };
}

export function verifyShopifyOAuthState(
  cookie: string | undefined,
  returnedState: string | null,
  secret: string,
  now = Date.now(),
) {
  if (!cookie || !returnedState) return null;
  const [payload, suppliedSignature, extra] = cookie.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(signature(payload, secret));
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as StatePayload;
    if (
      parsed.nonce !== returnedState || typeof parsed.userId !== "string" || !parsed.userId ||
      typeof parsed.issuedAt !== "number" || parsed.issuedAt > now + 30_000 ||
      now - parsed.issuedAt > OAUTH_STATE_TTL_MS
    ) return null;
    return parsed.userId;
  } catch {
    return null;
  }
}
