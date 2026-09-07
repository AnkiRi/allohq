import assert from "node:assert/strict";
import test from "node:test";
import { calculateNetOrderRevenue } from "./refund-revenue";

test("partial refunds reduce attributed revenue using cumulative Shopify data", () => {
  assert.equal(calculateNetOrderRevenue({
    total_price: "100.00",
    refunds: [{ transactions: [{ kind: "refund", status: "success", amount: "25.50" }] }],
  }, 100), 74.5);
});

test("failed refund transactions do not reduce revenue", () => {
  assert.equal(calculateNetOrderRevenue({
    total_price: 100,
    refunds: [{ transactions: [{ kind: "refund", status: "failure", amount: 90 }] }],
  }, 100), 100);
});

test("full and excess refunds cannot make attributed revenue negative", () => {
  assert.equal(calculateNetOrderRevenue({
    refunds: [{ transactions: [{ kind: "refund", status: "success", amount: 120 }] }],
  }, 100), 0);
});
