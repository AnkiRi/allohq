import assert from "node:assert/strict";
import test from "node:test";
import { missingAssignedCustomers } from "./causal-ledger";

test("a complete cohort reports nothing missing", () => {
  assert.deepEqual(missingAssignedCustomers(["a", "b", "c"], ["c", "a", "b"]), []);
});

test("an interrupted chunked write is detected rather than measured", () => {
  // Approval writes assignment rows in chunks. If it stops part way, the lift
  // job must refuse rather than compare arms over the customers that landed.
  assert.deepEqual(missingAssignedCustomers(["a", "b", "c", "d"], ["a", "b"]), ["c", "d"]);
});

test("extra assignment rows are tolerated, not treated as corruption", () => {
  // Re-approving with a narrower audience leaves earlier rows behind.
  assert.deepEqual(missingAssignedCustomers(["a", "b"], ["a", "b", "legacy-1", "legacy-2"]), []);
});

test("an empty frozen cohort cannot be incomplete", () => {
  assert.deepEqual(missingAssignedCustomers([], ["a"]), []);
});

test("no assignment rows at all reports every frozen customer", () => {
  assert.deepEqual(missingAssignedCustomers(["a", "b"], []), ["a", "b"]);
});
