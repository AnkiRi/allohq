import assert from "node:assert/strict";
import test from "node:test";
import { visualReferenceMode } from "./visual-reference";

test("a product reference cannot quietly use illustrative generation", () => {
  assert.equal(visualReferenceMode({ mode: "creative_concept", productId: "oxygen" }), "product_safe");
});
test("a chosen uploaded reference reaches the reference-capable path", () => {
  assert.equal(visualReferenceMode({ mode: "creative_concept", sourceAssetIds: ["sb"] }), "product_safe");
});
test("unreferenced artwork is still an explicit illustrative concept", () => {
  assert.equal(visualReferenceMode({ mode: "creative_concept" }), "creative_concept");
});
