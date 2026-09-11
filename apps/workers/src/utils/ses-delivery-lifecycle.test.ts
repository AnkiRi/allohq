import assert from "node:assert/strict";
import test from "node:test";
import { replayDisposition, type SesAttemptState } from "./ses-delivery-lifecycle";

test("accepted, ambiguous, submitting and manual-review attempts are never resubmitted", () => {
  for (const state of ["accepted", "ambiguous", "submitting", "manual_review"] satisfies SesAttemptState[]) assert.notEqual(replayDisposition(state), "submit", state);
  assert.equal(replayDisposition("failed"), "submit");
  assert.equal(replayDisposition("reserved"), "submit");
  assert.equal(replayDisposition(undefined), "submit");
});
