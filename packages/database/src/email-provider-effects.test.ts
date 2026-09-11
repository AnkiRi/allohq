import assert from "node:assert/strict";
import test from "node:test";
import { deliverabilityPauseReason } from "./email-provider-effects";

test("provider-neutral store pause uses the strict complaint threshold", () => {
  assert.equal(deliverabilityPauseReason({ complaints: 3, hardBounces: 0, rejections: 0, attempted: 1_000 }), null);
  assert.equal(deliverabilityPauseReason({ complaints: 4, hardBounces: 0, rejections: 0, attempted: 1_000 }), "complaints");
  assert.equal(deliverabilityPauseReason({ complaints: 0, hardBounces: 50, rejections: 0, attempted: 1_000 }), null);
  assert.equal(deliverabilityPauseReason({ complaints: 0, hardBounces: 0, rejections: 5, attempted: 50 }), "provider_rejections");
  assert.equal(deliverabilityPauseReason({ complaints: 0, hardBounces: 0, rejections: 0, attempted: 1_000 }), null);
});
