import test from "node:test";
import assert from "node:assert/strict";
import { sesEventConsumption, shouldConsumeSesEvents } from "./ses-events.worker";

/**
 * SES events must keep being read after new traffic moves back to Resend —
 * mail SES already accepted keeps producing bounces and complaints for days —
 * and must be read in the region the queue actually lives in.
 */
const STOCKHOLM_QUEUE = "https://sqs.eu-north-1.amazonaws.com/123456789012/joon-events";

test("SES events are read whenever the SES event queue is configured with its region", () => {
  assert.equal(shouldConsumeSesEvents({ EMAIL_PROVIDER: "ses", SES_EVENT_QUEUE_URL: STOCKHOLM_QUEUE, AWS_SES_REGION: "eu-north-1" }), true);
  assert.equal(
    shouldConsumeSesEvents({ EMAIL_PROVIDER: "resend", SES_EVENT_QUEUE_URL: STOCKHOLM_QUEUE, AWS_SES_REGION: "eu-north-1" }),
    true,
    "switching new traffic to Resend must not stop reading SES events",
  );
});

test("today's production configuration reads no SES events", () => {
  // Railway api and workers: EMAIL_PROVIDER=resend, no SES or AWS variables.
  assert.deepEqual(sesEventConsumption({ EMAIL_PROVIDER: "resend", MESSAGING_SEND_MODE: "allowlist" }), { consume: false, problem: null });
});

test("a queue without an explicit region is a reported problem, not a poll against the wrong region", () => {
  const decision = sesEventConsumption({ SES_EVENT_QUEUE_URL: STOCKHOLM_QUEUE });
  assert.equal(decision.consume, false);
  assert.match(decision.problem ?? "", /AWS_SES_REGION is not/);
});

test("a queue in a different region from AWS_SES_REGION is refused", () => {
  const decision = sesEventConsumption({ SES_EVENT_QUEUE_URL: STOCKHOLM_QUEUE, AWS_SES_REGION: "ap-south-1" });
  assert.equal(decision.consume, false);
  assert.match(decision.problem ?? "", /eu-north-1 but AWS_SES_REGION is ap-south-1/);
});

test("no queue, no consumer, no complaint", () => {
  assert.deepEqual(sesEventConsumption({ EMAIL_PROVIDER: "ses", AWS_SES_REGION: "eu-north-1" }), { consume: false, problem: null });
  assert.equal(shouldConsumeSesEvents({ SES_EVENT_QUEUE_URL: "   ", AWS_SES_REGION: "eu-north-1" }), false);
});
