import assert from "node:assert/strict";
import test from "node:test";
import {
  computeDiscountProfile,
  computeVipLevel,
  nextCycleEvaluationAt,
  resolveSendWindow,
} from "./state-engine";
import { VipLevel } from "./types";

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

test("VIP rank comes from the store's own distribution, never a money amount", () => {
  assert.equal(
    computeVipLevel({ orderCount: 12, monetaryQuintile: 5, frequencyQuintile: 5 }),
    VipLevel.PLATINUM
  );
  assert.equal(
    computeVipLevel({ orderCount: 6, monetaryQuintile: 4, frequencyQuintile: 3 }),
    VipLevel.GOLD
  );
  assert.equal(
    computeVipLevel({ orderCount: 3, monetaryQuintile: 3, frequencyQuintile: 2 }),
    VipLevel.SILVER
  );
  assert.equal(
    computeVipLevel({ orderCount: 2, monetaryQuintile: 2, frequencyQuintile: 2 }),
    VipLevel.STANDARD
  );
});

test("one large first order no longer makes a high-AOV store's customer platinum", () => {
  // The old ladder read absolute lifetime spend, so a single ₹2,000 order
  // cleared the ₹1,000 platinum bar and the whole list became VIP. Ranked
  // against the store's own buyers, a big first order is a top spender who has
  // bought once — silver, not platinum.
  assert.equal(
    computeVipLevel({ orderCount: 1, monetaryQuintile: 5, frequencyQuintile: 1 }),
    VipLevel.SILVER
  );
});

test("customers with no orders or no computed RFM are never treated as VIP", () => {
  assert.equal(
    computeVipLevel({ orderCount: 0, monetaryQuintile: 5, frequencyQuintile: 5 }),
    VipLevel.STANDARD
  );
  assert.equal(
    computeVipLevel({ orderCount: 9, monetaryQuintile: null, frequencyQuintile: null }),
    VipLevel.STANDARD
  );
});

test("send window reports observed hours and labels a fallback as one", () => {
  const customer = resolveSendWindow({
    storeTimezone: "Asia/Kolkata",
    customerProfile: {
      timezone: "Asia/Kolkata",
      evidenceCount: 18,
      confidence: 0.6,
      hourlyEvidence: [
        { hour: 20, score: 9 },
        { hour: 21, score: 4 },
      ],
    },
    storeProfile: null,
  });
  assert.deepEqual(customer.bestHours, [20, 21]);
  assert.equal(customer.source, "customer");
  assert.equal(customer.evidenceCount, 18);

  const store = resolveSendWindow({
    storeTimezone: "Asia/Kolkata",
    customerProfile: null,
    storeProfile: {
      timezone: "Asia/Kolkata",
      evidenceCount: 140,
      confidence: 0.4,
      hourlyEvidence: [{ hour: 11, score: 30 }],
    },
  });
  assert.deepEqual(store.bestHours, [11]);
  assert.equal(store.source, "store");

  const none = resolveSendWindow({
    storeTimezone: null,
    customerProfile: null,
    storeProfile: null,
  });
  assert.equal(none.source, "default");
  assert.equal(none.timezone, "UTC");
  assert.equal(none.confidence, 0);
});

test("malformed timing evidence falls back rather than inventing customer hours", () => {
  const result = resolveSendWindow({
    storeTimezone: "Asia/Kolkata",
    customerProfile: {
      timezone: "Asia/Kolkata",
      evidenceCount: 3,
      confidence: 0.1,
      hourlyEvidence: [{ score: 2 }, { hour: 99 }, "nonsense"],
    },
    storeProfile: null,
  });
  assert.equal(result.source, "default");
  assert.deepEqual(result.bestHours, [9, 10, 11, 14, 15]);
});
