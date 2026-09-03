import { createHmac, timingSafeEqual } from "node:crypto";

export type UnsubscribeChannel = "email" | "sms" | "whatsapp" | "rcs";

interface UnsubscribeClaims {
  v: 1;
  customerId: string;
  channel: UnsubscribeChannel;
  expiresAt: number;
}

function signingSecret(): string {
  const secret = process.env["UNSUBSCRIBE_SIGNING_SECRET"];
  if (!secret || secret.length < 32) {
    throw new Error(
      "UNSUBSCRIBE_SIGNING_SECRET must be configured with at least 32 characters",
    );
  }
  return secret;
}

export function assertUnsubscribeSigningConfigured(): void {
  signingSecret();
  const baseUrl = process.env["API_BASE_URL"];
  if (!baseUrl) throw new Error("API_BASE_URL must be configured for unsubscribe links");
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("API_BASE_URL must be a valid absolute URL");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("API_BASE_URL must use HTTPS in production");
  }
}

function signature(payload: string): string {
  return createHmac("sha256", signingSecret())
    .update(payload)
    .digest("base64url");
}

export function createUnsubscribeToken(
  customerId: string,
  channel: UnsubscribeChannel = "email",
  now = Date.now(),
): string {
  const claims: UnsubscribeClaims = {
    v: 1,
    customerId,
    channel,
    // Old campaign emails must remain actionable. Three years is bounded while
    // comfortably exceeding normal retention and attribution windows.
    expiresAt: Math.floor(now / 1000) + 3 * 365 * 24 * 60 * 60,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyUnsubscribeToken(
  token: string,
  now = Date.now(),
): UnsubscribeClaims | null {
  const [payload, providedSignature, ...rest] = token.split(".");
  if (!payload || !providedSignature || rest.length > 0) return null;

  const expectedSignature = signature(payload);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<UnsubscribeClaims>;
    if (
      claims.v !== 1 ||
      typeof claims.customerId !== "string" ||
      !["email", "sms", "whatsapp", "rcs"].includes(claims.channel ?? "") ||
      typeof claims.expiresAt !== "number" ||
      claims.expiresAt < Math.floor(now / 1000)
    ) {
      return null;
    }
    return claims as UnsubscribeClaims;
  } catch {
    return null;
  }
}

export function getUnsubscribeUrl(
  customerId: string,
  channel: UnsubscribeChannel = "email",
): string {
  const baseUrl = process.env["API_BASE_URL"] ?? "http://localhost:3001";
  const token = createUnsubscribeToken(customerId, channel);
  return `${baseUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
}
