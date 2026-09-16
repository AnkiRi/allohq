import assert from "node:assert/strict";
import test from "node:test";
import { deliveryWindowDelay } from "./delivery-window";

test("delivery windows are never clipped to twelve hours", () => {
  const now = new Date("2026-09-16T15:30:00.000Z"); // 21:00 IST
  const delay = deliveryWindowDelay({
    customerId: "customer-a",
    window: "morning",
    timezone: "Asia/Kolkata",
    now,
    isDemo: false,
  });
  assert.ok(delay > 12 * 60 * 60 * 1000);
  assert.ok(delay < 15 * 60 * 60 * 1000);
});

test("a recipient already inside the broad window is ready now", () => {
  const delay = deliveryWindowDelay({
    customerId: "customer-a",
    window: "morning",
    timezone: "Asia/Kolkata",
    now: new Date("2026-09-16T04:30:00.000Z"),
    isDemo: false,
  });
  assert.equal(delay, 0);
});
