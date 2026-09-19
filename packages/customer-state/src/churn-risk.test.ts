import assert from "node:assert/strict";
import test from "node:test";
import { estimateChurnRisk } from "./churn-risk";

const base = {
  daysSinceLastOrder: 30,
  orderCount: 3,
  totalSpend: 6_000,
  avgOrderIntervalDays: 30,
};

test("the monetary signal ranks within the store, not against a rupee constant", () => {
  const top = estimateChurnRisk({ ...base, monetaryQuintile: 5 }).signalBreakdown["monetary"]!;
  const bottom = estimateChurnRisk({ ...base, monetaryQuintile: 1 }).signalBreakdown["monetary"]!;
  assert.ok(top < bottom, "a top-quintile spender must carry less monetary risk");
});

test("identical quintiles score identically regardless of absolute spend", () => {
  // The defect this replaces used sigmoid(totalSpend, 150), so at a ₹2,000
  // average order value every buyer saturated the signal to roughly zero and it
  // separated nobody. Store-relative scoring must ignore the rupee amount.
  const lowAov = estimateChurnRisk({ ...base, totalSpend: 900, monetaryQuintile: 3 });
  const highAov = estimateChurnRisk({ ...base, totalSpend: 9_00_000, monetaryQuintile: 3 });
  assert.equal(lowAov.signalBreakdown["monetary"], highAov.signalBreakdown["monetary"]);
  assert.equal(lowAov.riskEstimate, highAov.riskEstimate);
});

test("an unknown quintile stays neutral rather than guessing", () => {
  assert.equal(estimateChurnRisk({ ...base }).signalBreakdown["monetary"], 0.5);
  assert.equal(
    estimateChurnRisk({ ...base, monetaryQuintile: null }).signalBreakdown["monetary"],
    0.5
  );
});

test("risk stays bounded and tiered", () => {
  const result = estimateChurnRisk({
    daysSinceLastOrder: 400,
    orderCount: 1,
    totalSpend: 500,
    monetaryQuintile: 1,
    avgOrderIntervalDays: 30,
  });
  assert.ok(result.riskEstimate >= 0 && result.riskEstimate <= 1);
  assert.equal(result.riskTier, "critical");
  assert.equal(result.modelKind, "heuristic_v1");
});
