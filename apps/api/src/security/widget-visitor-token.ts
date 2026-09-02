import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";
const DEFAULT_TTL_SECONDS = 10 * 60;

export interface WidgetVisitorClaims {
  storeId: string;
  origin: string;
  visitorId: string;
  expiresAt: number;
}

function signingSecret(): string {
  const value = process.env["WIDGET_VISITOR_SIGNING_SECRET"];
  if (!value || Buffer.byteLength(value) < 32) {
    throw new Error(
      "WIDGET_VISITOR_SIGNING_SECRET must contain at least 32 bytes",
    );
  }
  return value;
}

function signature(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

export function issueWidgetVisitorToken(
  claims: Omit<WidgetVisitorClaims, "expiresAt">,
  nowMs = Date.now(),
  ttlSeconds = DEFAULT_TTL_SECONDS,
): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(nowMs / 1_000) + ttlSeconds;
  const payload = Buffer.from(
    JSON.stringify({ ...claims, expiresAt }),
    "utf8",
  ).toString("base64url");
  return {
    token: `${TOKEN_VERSION}.${payload}.${signature(`${TOKEN_VERSION}.${payload}`)}`,
    expiresAt,
  };
}

export function verifyWidgetVisitorToken(
  token: string,
  expected: { storeId: string; origin: string },
  nowMs = Date.now(),
): WidgetVisitorClaims | null {
  const [version, payload, providedSignature, extra] = token.split(".");
  if (
    version !== TOKEN_VERSION ||
    !payload ||
    !providedSignature ||
    extra !== undefined
  ) return null;

  const expectedSignature = signature(`${version}.${payload}`);
  const provided = Buffer.from(providedSignature);
  const calculated = Buffer.from(expectedSignature);
  if (
    provided.length !== calculated.length ||
    !timingSafeEqual(provided, calculated)
  ) return null;

  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<WidgetVisitorClaims>;
    if (
      claims.storeId !== expected.storeId ||
      claims.origin !== expected.origin ||
      typeof claims.visitorId !== "string" ||
      claims.visitorId.length < 1 ||
      claims.visitorId.length > 128 ||
      typeof claims.expiresAt !== "number" ||
      claims.expiresAt <= Math.floor(nowMs / 1_000)
    ) return null;
    return claims as WidgetVisitorClaims;
  } catch {
    return null;
  }
}

export function bearerToken(header: string | string[] | undefined): string | null {
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer ([A-Za-z0-9._-]+)$/);
  return match?.[1] ?? null;
}
