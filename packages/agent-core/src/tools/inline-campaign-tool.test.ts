import assert from "node:assert/strict";
import test from "node:test";
import { containsDiscountLanguage } from "./inline-campaign-tool";

test("full-price validation catches offer language across structured creative", () => {
  assert.equal(containsDiscountLanguage({ subject: "20% off today" }), true);
  assert.equal(containsDiscountLanguage({ button: "Use coupon JOON20" }), true);
  assert.equal(containsDiscountLanguage({ body: "Explore the new collection at full price." }), false);
});
