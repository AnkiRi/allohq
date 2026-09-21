import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "./renderer";

/**
 * Product cards rendered every price as `$${value.toFixed(2)}`, so an Indian
 * store's ₹2,400 product read as $2400.00 to its own customers. The store's
 * currency now reaches the card.
 */

test("a store's own currency is used, not dollars", () => {
  assert.match(formatMoney("INR")(2400), /2,400/);
  assert.ok(!formatMoney("INR")(2400).includes("$"), "an INR store must not show a dollar sign");
  assert.match(formatMoney("GBP")(19.5), /19\.50/);
  assert.ok(!formatMoney("GBP")(19.5).includes("$"));
});

test("USD still formats as dollars", () => {
  assert.match(formatMoney("USD")(19.5), /\$\s?19\.50/);
});

test("an unknown currency is never asserted as dollars", () => {
  // No currency: show the amount, claim nothing about the unit.
  const unknown = formatMoney(undefined)(2400);
  assert.ok(!unknown.includes("$"), `"${unknown}" must not invent a dollar sign`);
  assert.match(unknown, /2,400\.00|2400\.00/);
});

test("an unrecognized code degrades instead of throwing", () => {
  const odd = formatMoney("NOT_A_CODE")(12);
  assert.ok(odd.includes("12"));
  assert.ok(!odd.includes("$"));
});
