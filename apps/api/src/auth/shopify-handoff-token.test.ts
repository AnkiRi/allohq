import test from "node:test";
import assert from "node:assert/strict";
import {
  createShopifyHandoff,
  hashShopifyHandoff,
  isRedeemableHandoff,
  SHOPIFY_HANDOFF_TTL_MS,
  canLinkShopifyIdentity,
} from "./shopify-handoff-token";

test("Shopify handoffs store a fixed digest, never the bearer token", () => {
  const now = Date.UTC(2026, 8, 5);
  const handoff = createShopifyHandoff(now);
  assert.notEqual(handoff.token, handoff.tokenHash);
  assert.equal(handoff.tokenHash, hashShopifyHandoff(handoff.token));
  assert.equal(handoff.tokenHash.length, 64);
  assert.equal(handoff.expiresAt.getTime(), now + SHOPIFY_HANDOFF_TTL_MS);
});

test("a real Shopify identity cannot be reassigned to a different Clerk account", () => {
  assert.equal(canLinkShopifyIdentity("shopify:store:staff", "user_a"), true);
  assert.equal(canLinkShopifyIdentity("user_a", "user_a"), true);
  assert.equal(canLinkShopifyIdentity("user_a", "user_b"), false);
});

test("handoffs fail closed after redemption or expiry", () => {
  const now = new Date("2026-09-05T12:00:00.000Z");
  assert.equal(
    isRedeemableHandoff({ redeemedAt: null, expiresAt: new Date(now.getTime() + 1) }, now),
    true
  );
  assert.equal(
    isRedeemableHandoff({ redeemedAt: now, expiresAt: new Date(now.getTime() + 1) }, now),
    false
  );
  assert.equal(isRedeemableHandoff({ redeemedAt: null, expiresAt: now }, now), false);
});
