import assert from "node:assert/strict";
import test from "node:test";
import { deliverabilityPauseReason } from "./deliverability-threshold";

test("pauses on absolute adverse-event safety floors", () => {
  assert.equal(deliverabilityPauseReason({ complaints: 3, hardBounces: 0, rejections: 0, attempted: 100_000 }), "complaints");
  assert.equal(deliverabilityPauseReason({ complaints: 0, hardBounces: 5, rejections: 0, attempted: 20 }), "hard_bounces");
  assert.equal(deliverabilityPauseReason({ complaints: 0, hardBounces: 0, rejections: 5, attempted: 20 }), "provider_rejections");
});

test("rate thresholds require a meaningful denominator", () => {
  assert.equal(deliverabilityPauseReason({ complaints: 1, hardBounces: 0, rejections: 0, attempted: 1_000 }), "complaints");
  assert.equal(deliverabilityPauseReason({ complaints: 0, hardBounces: 4, rejections: 0, attempted: 99 }), null);
  assert.equal(deliverabilityPauseReason({ complaints: 0, hardBounces: 0, rejections: 2, attempted: 100 }), "provider_rejections");
});
