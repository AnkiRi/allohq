import assert from "node:assert/strict";
import test from "node:test";
import { shouldPauseForComplaints } from "./complaint-threshold";

test("three complaints always pause a store", () => {
  assert.equal(shouldPauseForComplaints(3, 100_000), true);
});

test("rate threshold applies once there is a meaningful denominator", () => {
  assert.equal(shouldPauseForComplaints(1, 1_000), true);
  assert.equal(shouldPauseForComplaints(1, 999), false);
});
