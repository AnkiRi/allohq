import assert from "node:assert/strict";
import test from "node:test";
import { classifyCommerceCategory, COMMERCE_CATEGORIES } from "./commerce-categories";

test("provides a broad stable category vocabulary", () => assert.equal(COMMERCE_CATEGORIES.length, 20));
test("uses taxonomy, product type and title signals", () => {
  assert.equal(classifyCommerceCategory("Health & Beauty > Personal Care > Cosmetics > Skin Care", "Face Serum")?.key, "skincare");
  assert.equal(classifyCommerceCategory(null, "Fine Jewellery", "Gold Necklace")?.key, "jewellery");
});
