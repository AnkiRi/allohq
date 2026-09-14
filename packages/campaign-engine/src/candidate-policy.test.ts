import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCampaignCandidate } from "./candidate-policy";

const state = {
  discountBehavior: "full_price_likely",
  purchaseCyclePosition: "early",
  medianOrderIntervalDays: 45,
  nextExpectedOrderAt: new Date("2026-10-01T00:00:00.000Z"),
  stateEvidence: { orderCount: 10, fullPriceOrderCount: 10 },
};

test("a full-price customer inside their rhythm is left alone for a discount", () => {
  const decision = evaluateCampaignCandidate({ state, hasDiscount: true, merchantIncluded: false });
  assert.equal(decision.candidate, false);
  assert.equal(decision.reasonCode, "full_price_inside_cycle");
  assert.equal(decision.suggestedAlternative, "full_price_version");
  assert.match(decision.reasonText ?? "", /10 of 10 previous orders were at full price/);
});

test("the same customer can receive a relevant full-price announcement", () => {
  assert.equal(evaluateCampaignCandidate({ state, hasDiscount: false, merchantIncluded: false }).candidate, true);
});

test("a recorded merchant override restores campaign candidacy", () => {
  const decision = evaluateCampaignCandidate({ state, hasDiscount: true, merchantIncluded: true });
  assert.equal(decision.candidate, true);
  assert.equal(decision.reasonCode, "merchant_override");
});

test("an overdue customer returns to candidacy", () => {
  const decision = evaluateCampaignCandidate({
    state: { ...state, purchaseCyclePosition: "overdue" },
    hasDiscount: true,
    merchantIncluded: false,
  });
  assert.equal(decision.candidate, true);
});
