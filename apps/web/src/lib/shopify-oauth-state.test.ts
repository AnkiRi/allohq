import assert from "node:assert/strict";
import test from "node:test";
import { createShopifyOAuthState, verifyShopifyOAuthState } from "./shopify-oauth-state";

const SHOP = "joon-test.myshopify.com";

test("Shopify OAuth state stays bound to the initiating Joon user", () => {
  const now = Date.UTC(2026, 8, 13);
  const created = createShopifyOAuthState("user_founder", SHOP, "secret", now);
  assert.equal(
    verifyShopifyOAuthState(created.cookie, created.state, "secret", { shop: SHOP, now: now + 1_000 }),
    "user_founder",
  );
  assert.equal(verifyShopifyOAuthState(created.cookie, "other", "secret", { now }), null);
  assert.equal(verifyShopifyOAuthState(created.cookie, created.state, "wrong", { now }), null);
});

test("an install survives a dropped cookie but not a swapped one", () => {
  const now = Date.UTC(2026, 8, 13);
  const created = createShopifyOAuthState("user_founder", SHOP, "secret", now);
  // Shopify's cross-site return can arrive without the cookie; the signed
  // state in the query parameter is enough to identify the installer.
  assert.equal(verifyShopifyOAuthState(undefined, created.state, "secret", { now }), "user_founder");
  // A cookie that disagrees with the state is tampering, not cookie loss.
  const forged = createShopifyOAuthState("user_attacker", SHOP, "secret", now);
  assert.equal(verifyShopifyOAuthState(forged.cookie, created.state, "secret", { now }), null);
});

test("state cannot be replayed against a different shop", () => {
  const now = Date.UTC(2026, 8, 13);
  const created = createShopifyOAuthState("user_founder", SHOP, "secret", now);
  assert.equal(
    verifyShopifyOAuthState(created.cookie, created.state, "secret", {
      shop: "attacker-shop.myshopify.com",
      now,
    }),
    null,
  );
  // Shop comparison ignores case, as Shopify echoes the domain back verbatim.
  assert.equal(
    verifyShopifyOAuthState(created.cookie, created.state, "secret", {
      shop: SHOP.toUpperCase(),
      now,
    }),
    "user_founder",
  );
});

test("Shopify OAuth state expires after thirty minutes and rejects junk", () => {
  const now = Date.UTC(2026, 8, 13);
  const created = createShopifyOAuthState("user_founder", SHOP, "secret", now);
  // A merchant reading the permission screen for twenty minutes still lands.
  assert.equal(
    verifyShopifyOAuthState(created.cookie, created.state, "secret", { now: now + 20 * 60_000 }),
    "user_founder",
  );
  assert.equal(
    verifyShopifyOAuthState(created.cookie, created.state, "secret", { now: now + 30 * 60_000 + 1 }),
    null,
  );
  assert.equal(verifyShopifyOAuthState("broken", created.state, "secret", { now }), null);
  assert.equal(verifyShopifyOAuthState(undefined, "broken", "secret", { now }), null);
});
