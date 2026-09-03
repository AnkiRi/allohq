import assert from "node:assert/strict";
import test from "node:test";
import { sanitizePixelValue, safePixelTimestamp, SHOPIFY_PIXEL_EVENT_TYPES } from "./storefront-events";

test("supports Shopify storefront and checkout lifecycle events", () => {
  for (const type of ["page_viewed", "collection_viewed", "product_viewed", "product_added_to_cart", "checkout_completed"]) {
    assert.equal(SHOPIFY_PIXEL_EVENT_TYPES.has(type), true);
  }
});

test("removes direct customer and payment data from nested pixel payloads", () => {
  assert.deepEqual(sanitizePixelValue({ email: "a@b.com", checkout: { phone: "1", token: "safe" }, product: { id: "p1" } }), {
    checkout: { token: "safe" }, product: { id: "p1" },
  });
});

test("rejects implausible client timestamps", () => {
  const now = Date.parse("2026-09-03T12:00:00Z");
  assert.equal(safePixelTimestamp("2020-01-01T00:00:00Z", now).getTime(), now);
});
