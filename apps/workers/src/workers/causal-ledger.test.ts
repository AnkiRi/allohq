import assert from "node:assert/strict";
import test from "node:test";
import { MIN_OBSERVED_PER_ARM, measuredTier, missingAssignedCustomers } from "./causal-ledger";

const arms = (treatedCount: number, controlCount: number) => [{ treatedCount, controlCount }];
const decisive = { ciLow: 120, ciHigh: 480 };
const straddlesZero = { ciLow: -200, ciHigh: 500 };

test("a tier is earned from the observed outcome, not assumed at approval", () => {
  // Previously the tier was read back from the approval-time label, which can
  // only be empty, unmeasured or directional. measurement_ready was therefore
  // unreachable and no unit could ever become billable.
  assert.equal(measuredTier(arms(2_000, 300), decisive), "measurement_ready");
});

test("no control group can never be measured", () => {
  assert.equal(measuredTier(arms(5_000, 0), decisive), "unmeasured");
  assert.equal(measuredTier([], decisive), "empty");
});

test("an interval that straddles zero stays directional however large the arms", () => {
  assert.equal(measuredTier(arms(50_000, 9_000), straddlesZero), "directional");
});

test("arms below the observed minimum stay directional even with a decisive interval", () => {
  assert.equal(measuredTier(arms(MIN_OBSERVED_PER_ARM - 1, 500), decisive), "directional");
  assert.equal(measuredTier(arms(500, MIN_OBSERVED_PER_ARM - 1), decisive), "directional");
  assert.equal(
    measuredTier(arms(MIN_OBSERVED_PER_ARM, MIN_OBSERVED_PER_ARM), decisive),
    "measurement_ready"
  );
});

test("a decisively negative result is measured too", () => {
  assert.equal(measuredTier(arms(2_000, 300), { ciLow: -900, ciHigh: -50 }), "measurement_ready");
});

test("counts are pooled across strata", () => {
  const perStratum = [
    { treatedCount: 20, controlCount: 18 },
    { treatedCount: 20, controlCount: 18 },
  ];
  assert.equal(measuredTier(perStratum, decisive), "measurement_ready");
});

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
