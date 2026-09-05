import { createHash, randomBytes } from "node:crypto";

export const SHOPIFY_HANDOFF_TTL_MS = 5 * 60 * 1000;

export function createShopifyHandoff(now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashShopifyHandoff(token),
    expiresAt: new Date(now + SHOPIFY_HANDOFF_TTL_MS),
  };
}

export function hashShopifyHandoff(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isRedeemableHandoff(
  input: { redeemedAt: Date | null; expiresAt: Date },
  now = new Date()
) {
  return input.redeemedAt === null && input.expiresAt > now;
}

export function canLinkShopifyIdentity(existingClerkId: string, redeemingClerkId: string) {
  return existingClerkId.startsWith("shopify:") || existingClerkId === redeemingClerkId;
}
