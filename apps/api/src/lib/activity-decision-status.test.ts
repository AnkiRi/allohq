import test from "node:test";
import assert from "node:assert/strict";
import { activityDecisionStatus } from "./activity-decision-status";

const now = new Date("2026-09-26T12:00:00.000Z");

test("a pending decision whose deadline passed is displayed as expired", () => {
  assert.equal(activityDecisionStatus("pending", new Date("2026-09-25T12:00:00.000Z"), now), "expired");
});

test("a live pending decision remains actionable", () => {
  assert.equal(activityDecisionStatus("pending", new Date("2026-09-27T12:00:00.000Z"), now), "pending");
});

test("a resolved decision keeps its outcome even if its former deadline passed", () => {
  for (const status of ["approved", "executed", "rejected", "failed"]) {
    assert.equal(activityDecisionStatus(status, new Date("2026-09-25T12:00:00.000Z"), now), status);
  }
});
