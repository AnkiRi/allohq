import assert from "node:assert/strict";
import test from "node:test";
import { emailDomain } from "./sender-domain";

test("extracts sender domains", () => {
  assert.equal(emailDomain("hello@Brand.COM"), "brand.com");
  assert.equal(emailDomain("Brand <news@updates.brand.com>"), "updates.brand.com");
  assert.equal(emailDomain("not-an-email"), null);
});
