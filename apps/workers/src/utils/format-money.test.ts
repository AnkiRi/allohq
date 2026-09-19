import assert from "node:assert/strict";
import test from "node:test";
import { formatStoreMoney } from "./format-money";

test("store money renders in the store's own currency, never a hardcoded dollar", () => {
  // The defect this replaces produced "$4000.00" for an Indian store.
  assert.match(formatStoreMoney(4000, "INR"), /^₹/);
  assert.match(formatStoreMoney(4000, "USD"), /^\$/);
  assert.match(formatStoreMoney(4000, "AED"), /AED/);
});

test("an unknown currency falls back instead of inventing a symbol", () => {
  assert.equal(formatStoreMoney(1234.5, null), "1234.50");
  assert.equal(formatStoreMoney(1234.5, ""), "1234.50");
  assert.equal(formatStoreMoney(1234.5, "rupees"), "1234.50");
});

test("non-finite amounts never reach a customer as NaN", () => {
  assert.equal(formatStoreMoney(Number.NaN, null), "0.00");
  assert.match(formatStoreMoney(Number.POSITIVE_INFINITY, "INR"), /0\.00$/);
});

test("Indian grouping is used for rupee amounts", () => {
  // 12,34,567 rather than 1,234,567.
  assert.match(formatStoreMoney(1234567, "INR"), /12,34,567/);
});
