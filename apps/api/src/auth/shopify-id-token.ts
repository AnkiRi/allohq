import { createHmac, timingSafeEqual } from "node:crypto";

interface ShopifyIdTokenHeader {
  alg?: string;
  typ?: string;
}

export interface ShopifyIdTokenClaims {
  iss: string;
  dest: string;
  aud: string | string[];
  sub: string;
  exp: number;
  nbf: number;
  iat?: number;
  jti?: string;
  sid?: string;
}

export interface VerifiedShopifyIdentity {
  shopDomain: string;
  staffSubject: string;
  sessionId: string | null;
  claims: ShopifyIdTokenClaims;
}

export class ShopifyIdTokenError extends Error {
  readonly code = "INVALID_SHOPIFY_ID_TOKEN" as const;

  constructor(reason: string) {
    super(`Invalid Shopify ID token: ${reason}`);
    this.name = "ShopifyIdTokenError";
  }
}

function decodeJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    throw new ShopifyIdTokenError(`${label} is not valid base64url JSON`);
  }
}

function hostname(value: string, claim: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") throw new Error("not https");
    return parsed.hostname.toLowerCase();
  } catch {
    throw new ShopifyIdTokenError(`${claim} is not a valid HTTPS URL`);
  }
}

/**
 * Verify the short-lived HS256 ID token issued by App Bridge.
 *
 * This authenticates the Shopify staff session; it is never forwarded to the
 * Admin API and does not replace the store's encrypted offline access token.
 */
export function verifyShopifyIdToken(
  token: string,
  options: {
    apiKey: string;
    apiSecret: string;
    nowSeconds?: number;
    clockSkewSeconds?: number;
  },
): VerifiedShopifyIdentity {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new ShopifyIdTokenError("expected a three-part JWT");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
  const header = decodeJson<ShopifyIdTokenHeader>(encodedHeader, "header");
  if (header.alg !== "HS256") {
    throw new ShopifyIdTokenError("algorithm must be HS256");
  }

  const suppliedSignature = Buffer.from(encodedSignature, "base64url");
  const expectedSignature = createHmac("sha256", options.apiSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw new ShopifyIdTokenError("signature mismatch");
  }

  const claims = decodeJson<ShopifyIdTokenClaims>(encodedPayload, "payload");
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const skew = options.clockSkewSeconds ?? 5;
  if (!Number.isFinite(claims.exp) || claims.exp < now - skew) {
    throw new ShopifyIdTokenError("token expired");
  }
  if (!Number.isFinite(claims.nbf) || claims.nbf > now + skew) {
    throw new ShopifyIdTokenError("token is not active yet");
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(options.apiKey)) {
    throw new ShopifyIdTokenError("audience mismatch");
  }
  if (!claims.sub || typeof claims.sub !== "string") {
    throw new ShopifyIdTokenError("subject missing");
  }

  const issuerHost = hostname(claims.iss, "issuer");
  const destinationHost = hostname(claims.dest, "destination");
  if (issuerHost !== destinationHost) {
    throw new ShopifyIdTokenError("issuer and destination shops differ");
  }
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(destinationHost)) {
    throw new ShopifyIdTokenError("destination is not a myshopify.com domain");
  }

  return {
    shopDomain: destinationHost,
    staffSubject: claims.sub,
    sessionId: typeof claims.sid === "string" ? claims.sid : null,
    claims,
  };
}
