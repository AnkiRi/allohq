import assert from "node:assert/strict";
import test from "node:test";
import { eventTriggerJobId } from "./event-trigger-id";

test("same event retries use the same trigger job id", () => {
  assert.equal(eventTriggerJobId("a", "c", "evt/1"), eventTriggerJobId("a", "c", "evt/1"));
});

test("later events can enter a repeatable journey", () => {
  assert.notEqual(eventTriggerJobId("a", "c", "evt/1"), eventTriggerJobId("a", "c", "evt/2"));
});
