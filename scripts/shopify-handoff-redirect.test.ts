import test from "node:test";
import assert from "node:assert/strict";
import { shopifyHandoffReturnPath } from "../apps/web/src/lib/shopify-handoff";

test("Clerk returns to the same handoff after sign-in instead of skipping to dashboard", () => {
  const token = "a".repeat(43);
  assert.equal(shopifyHandoffReturnPath(token), `/shopify/continue?token=${token}`);
});

test("malformed handoff values are never reflected into the redirect URL", () => {
  assert.equal(shopifyHandoffReturnPath("https://evil.example"), "/shopify/continue");
  assert.equal(shopifyHandoffReturnPath(null), "/shopify/continue");
});
