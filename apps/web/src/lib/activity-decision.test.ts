import test from "node:test";
import assert from "node:assert/strict";
import { activityDecisionResult } from "./activity-decision";

test("linked decisions show their current outcome, not the historical queue event", () => {
  for (const [status, expected] of [
    ["pending", "Awaiting review now"],
    ["expired", "Expired without approval"],
    ["approved", "Approved"],
    ["rejected", "Passed"],
  ] as const) {
    assert.equal(activityDecisionResult({ actionTaken: "queued_for_review", decision: { status } }), expected);
  }
});

test("older review events never pretend to have an exact decision link", () => {
  assert.match(activityDecisionResult({ actionTaken: "queued_for_review", entityType: "customer" }), /not linked/);
});

test("a missing linked decision is distinguished from an older unlinked event", () => {
  assert.match(activityDecisionResult({ actionTaken: "queued_for_review", entityType: "action", entityId: "deleted" }), /no longer available/);
});
