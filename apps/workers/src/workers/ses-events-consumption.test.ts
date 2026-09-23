import test from "node:test";
import assert from "node:assert/strict";
import { shouldConsumeSesEvents } from "./ses-events.worker";

/**
 * SES events must keep being read after new traffic moves back to Resend:
 * mail SES already accepted keeps producing bounces and complaints for days.
 */
test("SES events are read whenever the SES event queue is configured", () => {
  const queue = "https://sqs.ap-south-1.amazonaws.com/123456789012/joon-events";
  assert.equal(shouldConsumeSesEvents({ EMAIL_PROVIDER: "ses", SES_EVENT_QUEUE_URL: queue }), true);
  assert.equal(
    shouldConsumeSesEvents({ EMAIL_PROVIDER: "resend", SES_EVENT_QUEUE_URL: queue }),
    true,
    "switching new traffic to Resend must not stop reading SES events",
  );
});

test("no queue, no consumer", () => {
  assert.equal(shouldConsumeSesEvents({ EMAIL_PROVIDER: "ses" }), false);
  assert.equal(shouldConsumeSesEvents({ EMAIL_PROVIDER: "ses", SES_EVENT_QUEUE_URL: "   " }), false);
});
