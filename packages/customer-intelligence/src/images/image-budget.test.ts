import assert from "node:assert/strict";
import test from "node:test";
import { imageBudgetChargeUsd, imageBudgetExceeded } from "./image-budget";

test("spend at or above the budget stops paid generation", () => {
  assert.equal(imageBudgetExceeded(4.99, 5), false);
  assert.equal(imageBudgetExceeded(5, 5), true);
  assert.equal(imageBudgetExceeded(12.5, 5), true);
});

test("a fresh day generates normally", () => {
  assert.equal(imageBudgetExceeded(0, 5), false);
});

test("a missing or nonsensical budget fails closed to stock", () => {
  // Misconfiguration must not open the tap: image spend is real money against
  // Joon's own providers, and nothing capped it before.
  assert.equal(imageBudgetExceeded(0, 0), true);
  assert.equal(imageBudgetExceeded(0, -1), true);
  assert.equal(imageBudgetExceeded(0, Number.NaN), true);
});

test("an unreadable spend figure fails closed", () => {
  assert.equal(imageBudgetExceeded(Number.NaN, 5), true);
  assert.equal(imageBudgetExceeded(-3, 5), true);
});

test("missing provider usage still consumes a conservative budget charge", () => {
  assert.equal(imageBudgetChargeUsd(0.03), 0.03);
  assert.equal(imageBudgetChargeUsd(undefined), 0.5);
  assert.equal(imageBudgetChargeUsd(0), 0.5);
  assert.equal(imageBudgetChargeUsd(Number.NaN), 0.5);
});
