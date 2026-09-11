import assert from "node:assert/strict";
import test from "node:test";
import { landingEventSchema } from "./landing-event-schema";

test("landing analytics accepts enumerated aggregate buckets", () => {
  assert.equal(landingEventSchema.safeParse({
    event: "calculator_result",
    data: {
      subscribers: "<=30000", revenue: "<=2000000", emailShare: "<=20",
      causedShare: "<=50", blasts: "<=4", currency: "INR",
      tool: "shopify_email", result: "at_or_below_current_tool",
    },
  }).success, true);
});

test("landing analytics rejects raw values and arbitrary identifiers", () => {
  assert.equal(landingEventSchema.safeParse({
    event: "calculator_result",
    data: {
      subscribers: "70000", revenue: "1500000", emailShare: "20",
      causedShare: "40", blasts: "4", currency: "INR",
      tool: "shopify_email", result: "at_or_below_current_tool",
      email: "merchant@example.com",
    },
  }).success, false);
});
