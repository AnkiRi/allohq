import assert from "node:assert/strict";
import test from "node:test";
import { createShopifyOAuthState, verifyShopifyOAuthState } from "./shopify-oauth-state";

test("Shopify OAuth state stays bound to the initiating Joon user", () => {
  const now = Date.UTC(2026, 8, 13);
  const created = createShopifyOAuthState("user_founder", "secret", now);
  assert.equal(verifyShopifyOAuthState(created.cookie, created.state, "secret", now + 1_000), "user_founder");
  assert.equal(verifyShopifyOAuthState(created.cookie, "other", "secret", now), null);
  assert.equal(verifyShopifyOAuthState(created.cookie, created.state, "wrong", now), null);
});

test("Shopify OAuth state expires and rejects malformed cookies", () => {
  const now = Date.UTC(2026, 8, 13);
  const created = createShopifyOAuthState("user_founder", "secret", now);
  assert.equal(verifyShopifyOAuthState(created.cookie, created.state, "secret", now + 600_001), null);
  assert.equal(verifyShopifyOAuthState("broken", created.state, "secret", now), null);
});
