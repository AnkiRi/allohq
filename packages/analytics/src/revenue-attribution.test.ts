import test from "node:test";
import assert from "node:assert/strict";
import { attributionWeights } from "./revenue-attribution";

test("first and last touch credit exactly one real touch", () => {
  assert.deepEqual(attributionWeights(3, "first_touch"), [1, 0, 0]);
  assert.deepEqual(attributionWeights(3, "last_touch"), [0, 0, 1]);
});

test("linear attribution preserves total order revenue", () => {
  const weights = attributionWeights(4, "linear");
  assert.ok(Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  assert.ok(weights.every((weight) => Math.abs(weight - 0.25) < 1e-12));
});

test("time decay favors the most recent touch and preserves total revenue", () => {
  const weights = attributionWeights(4, "time_decay");
  assert.ok(weights[3]! > weights[2]! && weights[2]! > weights[1]!);
  assert.ok(Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
});
