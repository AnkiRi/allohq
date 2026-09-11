import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSesEvent, parseSnsWrappedSesEvent } from "./ses-events";
import { engagementRank, warmupDailyCap, warmupHealthAction } from "./warmup";

const send = { eventType: "Send", eventId: "e1", mail: { messageId: "m1", timestamp: "2026-09-11T00:00:00Z", tags: { delivery: ["abc"] } } };
test("normalizes direct and SNS-wrapped SES events", () => { assert.equal(normalizeSesEvent(send).deliveryTag, "abc"); assert.equal(parseSnsWrappedSesEvent(JSON.stringify({ Message: JSON.stringify(send) })).kind, "send"); });
test("SNS envelope rejects a mismatched topic before processing", () => {
  process.env["SES_EVENT_TOPIC_ARN"] = "arn:aws:sns:ap-south-1:123456789012:expected";
  assert.throws(() => parseSnsWrappedSesEvent(JSON.stringify({ Type: "Notification", TopicArn: "arn:aws:sns:ap-south-1:123456789012:other", Message: JSON.stringify(send) })), /TopicArn/);
  delete process.env["SES_EVENT_TOPIC_ARN"];
});
test("warmup doubles from 500 and never exceeds eligibility", () => { assert.equal(warmupDailyCap(1, 70_000), 500); assert.equal(warmupDailyCap(8, 70_000), 64_000); assert.equal(warmupDailyCap(9, 70_000), 70_000); });
test("warmup health holds and pauses at strict thresholds", () => { assert.equal(warmupHealthAction({ delivered: 10_000, bounced: 205, complained: 0 }), "hold"); assert.equal(warmupHealthAction({ delivered: 10_000, bounced: 0, complained: 31 }), "pause"); });
test("engagement prioritizes purchases and clicks, not opens", () => { const now = new Date("2026-09-11"); assert.equal(engagementRank({ clickedOrBoughtAt: new Date("2026-08-20") }, now), 0); assert.equal(engagementRank({ openedAt: new Date("2026-09-10") }, now), 2); });
