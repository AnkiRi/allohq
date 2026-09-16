import assert from "node:assert/strict";
import test from "node:test";
import { campaignDeliveryCompletion } from "./campaign-delivery-completion";

test("a delivered recipient and a bounced recipient complete a sent campaign", () => {
  assert.deepEqual(
    campaignDeliveryCompletion(2, { delivered: 1, bounced: 1 }),
    { accepted: 2, failed: 0, suppressed: 0, completed: 2, status: "sent" },
  );
});

test("pending recipients cannot be finalized by a timer", () => {
  assert.equal(campaignDeliveryCompletion(2, { sent: 1 }).status, null);
});

test("mixed provider acceptance and terminal failure is partial", () => {
  assert.equal(campaignDeliveryCompletion(2, { delivered: 1, failed: 1 }).status, "partially_sent");
});

test("no accepted recipients is a failed campaign", () => {
  assert.equal(campaignDeliveryCompletion(2, { failed: 1, suppressed: 1 }).status, "failed");
});
