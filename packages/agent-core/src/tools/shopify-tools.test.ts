import assert from "node:assert/strict";
import test from "node:test";
import { productSearchMode } from "./shopify-tools";

test("new-product requests use catalog recency rather than literal text search", () => {
  for (const query of [
    "new products",
    "New Arrivals",
    "latest products",
    "newest",
    "recently added",
  ]) {
    assert.equal(productSearchMode(query), "newest", query);
  }
});

test("ordinary product requests retain keyword search", () => {
  assert.equal(productSearchMode("snowboards"), "text");
  assert.equal(productSearchMode("protein powder"), "text");
});
