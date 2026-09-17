import assert from "node:assert/strict";
import test from "node:test";
import { containsDiscountLanguage } from "./inline-campaign-tool";

test("full-price validation catches offer language across structured creative", () => {
  assert.equal(containsDiscountLanguage({ subject: "20% off today" }), true);
  assert.equal(containsDiscountLanguage({ button: "Use coupon JOON20" }), true);
  assert.equal(
    containsDiscountLanguage({ body: "Explore the new collection at full price." }),
    false
  );
  assert.equal(
    containsDiscountLanguage({ body: "Use code SNOW2023 for a special discount" }),
    true
  );
  assert.equal(containsDiscountLanguage({ body: "Don't miss our exclusive promotion" }), true);
});
