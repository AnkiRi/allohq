import assert from "node:assert/strict";
import test from "node:test";
import { quietHoursDeferralMs } from "./automation-quiet-hours";

test("quiet hours defer the current automation node until its explicit boundary", () => {
  const now = new Date("2026-01-01T17:10:00.000Z");
  assert.equal(quietHoursDeferralMs({
    allowed: false,
    rule: "quiet_hours",
    delayUntil: new Date("2026-01-02T01:30:00.000Z"),
  }, now), 8 * 60 * 60 * 1000 + 20 * 60 * 1000);
});

test("non-quiet governor decisions are not converted into deferrals", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(quietHoursDeferralMs({ allowed: false, rule: "fatigue", delayUntil: new Date("2026-01-02") }, now), null);
  assert.equal(quietHoursDeferralMs({ allowed: true }, now), null);
});
