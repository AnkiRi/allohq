import assert from "node:assert/strict";
import test from "node:test";
import { localHour } from "./send-time-optimizer";

test("engagement hours are interpreted in the merchant timezone", () => {
  const instant = new Date("2026-09-03T04:30:00.000Z");
  assert.equal(localHour(instant, "UTC"), 4);
  assert.equal(localHour(instant, "Asia/Kolkata"), 10);
  assert.equal(localHour(instant, "America/New_York"), 0);
});

test("invalid timezones fail closed to UTC", () => {
  assert.equal(localHour(new Date("2026-09-03T04:30:00.000Z"), "not/a-zone"), 4);
});
