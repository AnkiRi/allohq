import assert from "node:assert/strict";
import test from "node:test";
import { calculateCountedOrderRevenue } from "./refund-revenue";

test("partial refunds do not change attributed revenue", () => {
  assert.equal(calculateCountedOrderRevenue({
    total_price: "100.00",
    refunds: [{ transactions: [{ kind: "refund", status: "success", amount: "25.50" }] }],
  }, 100), 100);
});

test("refund transaction state is outside the v1 billing rule", () => {
  assert.equal(calculateCountedOrderRevenue({
    total_price: 100,
    refunds: [{ transactions: [{ kind: "refund", status: "failure", amount: 90 }] }],
  }, 100), 100);
});

test("full refunds remain counted unless the order is cancelled", () => {
  assert.equal(calculateCountedOrderRevenue({
    refunds: [{ transactions: [{ kind: "refund", status: "success", amount: 120 }] }],
  }, 100), 100);
});
