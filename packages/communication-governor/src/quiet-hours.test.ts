import assert from "node:assert/strict";
import test from "node:test";
import { checkQuietHours, nextLocalHour } from "./quiet-hours";

test("22:40 customer-local time defers to 07:00 customer-local time", () => {
  const decision = checkQuietHours("Asia/Kolkata", { startHour: 22, endHour: 7 }, new Date("2026-01-01T17:10:00.000Z"));
  assert.equal(decision.allowed, false);
  assert.equal(decision.delayUntil?.toISOString(), "2026-01-02T01:30:00.000Z");
});

test("the same instant is evaluated independently in mixed customer timezones", () => {
  const now = new Date("2026-01-02T06:40:00.000Z"); // 22:40 in Los Angeles, 12:10 in Kolkata
  assert.equal(checkQuietHours("America/Los_Angeles", { startHour: 22, endHour: 7 }, now).allowed, false);
  assert.equal(checkQuietHours("Asia/Kolkata", { startHour: 22, endHour: 7 }, now).allowed, true);
});

test("next quiet-hour boundary uses the post-transition DST offset", () => {
  const now = new Date("2026-03-08T06:30:00.000Z"); // 01:30 EST; clocks advance at 02:00
  const decision = checkQuietHours("America/New_York", { startHour: 22, endHour: 7 }, now);
  assert.equal(decision.delayUntil?.toISOString(), "2026-03-08T11:00:00.000Z"); // 07:00 EDT
});

test("invalid zones fall back to UTC and local-hour scheduling is explicit", () => {
  const now = new Date("2026-01-01T22:40:00.000Z");
  assert.equal(checkQuietHours("Not/AZone", { startHour: 22, endHour: 7 }, now).delayUntil?.toISOString(), "2026-01-02T07:00:00.000Z");
  assert.equal(nextLocalHour(new Date("2026-01-01T06:30:00.000Z"), 7, "UTC").toISOString(), "2026-01-01T07:00:00.000Z");
});
