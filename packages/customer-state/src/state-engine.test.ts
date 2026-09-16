import assert from "node:assert/strict";
import test from "node:test";
import { computeDiscountProfile, nextCycleEvaluationAt } from "./state-engine";

const order = (discount: number, codes: string[] = []) => ({
  totalDiscounts: discount,
  discountCodes: codes,
});

test("full-price history is inferred from actual Shopify discount evidence", () => {
  const profile = computeDiscountProfile(Array.from({ length: 10 }, () => order(0)));
  assert.deepEqual(profile, {
    sensitivity: 0,
    behavior: "full_price_likely",
    fullPriceOrderCount: 10,
    discountedOrderCount: 0,
  });
});

test("discount codes count even when the synchronized amount is zero", () => {
  const profile = computeDiscountProfile([order(0, ["WELCOME"]), order(200), order(0)]);
  assert.equal(profile.sensitivity, 0.67);
  assert.equal(profile.behavior, "discount_responsive");
  assert.equal(profile.discountedOrderCount, 2);
});

test("sparse history remains inconclusive", () => {
  assert.equal(computeDiscountProfile([order(0)]).behavior, "inconclusive");
});

test("customer state is reconsidered at the next purchase-cycle boundary", () => {
  const lastOrderAt = new Date("2026-01-01T00:00:00.000Z");
  const now = new Date("2026-01-20T00:00:00.000Z");
  assert.equal(
    nextCycleEvaluationAt({ lastOrderAt, medianOrderIntervalDays: 40, now }).toISOString(),
    "2026-01-31T00:00:00.000Z"
  );
});

test("overdue and unknown cycles are reconsidered weekly instead of scanned nightly", () => {
  const now = new Date("2026-03-01T00:00:00.000Z");
  assert.equal(
    nextCycleEvaluationAt({
      lastOrderAt: new Date("2025-01-01T00:00:00.000Z"),
      medianOrderIntervalDays: 30,
      now,
    }).toISOString(),
    "2026-03-08T00:00:00.000Z"
  );
  assert.equal(
    nextCycleEvaluationAt({ lastOrderAt: null, medianOrderIntervalDays: null, now }).toISOString(),
    "2026-03-08T00:00:00.000Z"
  );
});
