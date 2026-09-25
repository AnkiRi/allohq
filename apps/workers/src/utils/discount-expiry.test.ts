import assert from "node:assert/strict";
import test from "node:test";
import { discountEndsAt } from "./discount-expiry";

const launch = new Date("2026-09-25T12:00:00.000Z");

test("an explicit 24-hour offer expires 24 hours after launch", () => {
  assert.equal(discountEndsAt(24, launch).toISOString(), "2026-09-26T12:00:00.000Z");
});

test("older drafts retain the 30-day default", () => {
  assert.equal(discountEndsAt(undefined, launch).toISOString(), "2026-10-25T12:00:00.000Z");
});

test("invalid explicit validity fails closed", () => {
  for (const hours of [0, -1, 721, 1.5, "24"]) {
    assert.throws(() => discountEndsAt(hours, launch), /validity is invalid/);
  }
});
