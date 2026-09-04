import test from "node:test";
import assert from "node:assert/strict";
import { automationContinuationJobId } from "./automation-continuation";

test("the same journey execution and step always produce one continuation id", () => {
  const input = { automationId: "auto:1", executionId: "event/order/7", nextNodeIndex: 3 };
  assert.equal(automationContinuationJobId(input), "continue-auto_1-event_order_7-3");
  assert.equal(automationContinuationJobId(input), automationContinuationJobId(input));
});

test("different steps cannot collide", () => {
  assert.notEqual(
    automationContinuationJobId({ automationId: "a", executionId: "e", nextNodeIndex: 2 }),
    automationContinuationJobId({ automationId: "a", executionId: "e", nextNodeIndex: 3 }),
  );
});
