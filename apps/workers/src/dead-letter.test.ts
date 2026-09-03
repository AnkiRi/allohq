import test from "node:test";
import assert from "node:assert/strict";
import { deadLetterJobId, isTerminalAttempt } from "./dead-letter";

test("dead-letter ids are deterministic and safe for BullMQ", () => {
  assert.equal(
    deadLetterJobId({ sourceQueue: "email-send", sourceJobId: "deliver:campaign/customer", attemptsMade: 5 }),
    "email-send-deliver_campaign_customer-5",
  );
});

test("only exhausted jobs enter the dead-letter queue", () => {
  assert.equal(isTerminalAttempt(1, 5), false);
  assert.equal(isTerminalAttempt(5, 5), true);
  assert.equal(isTerminalAttempt(1, undefined), true);
});
