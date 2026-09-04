import test from "node:test";
import assert from "node:assert/strict";
import { deadLetterJobId } from "./dead-letter";

test("dead-letter ids are deterministic and safe for BullMQ", () => {
  assert.equal(
    deadLetterJobId({ sourceQueue: "email-send", sourceJobId: "deliver:campaign/customer", attemptsMade: 5 }),
    "email-send-deliver_campaign_customer-5",
  );
});
