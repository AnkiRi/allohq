import test from "node:test";
import assert from "node:assert/strict";
import { assignCohortArms, campaignMeasurementPolicy } from "./experiments";

test("finite campaign cohorts receive an exact deterministic control quota", () => {
  const experiment = { assignmentSeed: "test-seed", splitRatio: 0.15 };
  const customers = Array.from({ length: 50 }, (_, index) => `customer-${index + 1}`);
  const first = assignCohortArms(experiment as any, customers);
  const second = assignCohortArms(experiment as any, [...customers].reverse());

  assert.equal([...first.values()].filter((arm) => arm === "CONTROL").length, 7);
  assert.deepEqual([...first.entries()].sort(), [...second.entries()].sort());
});

test("small cohorts are explicitly unmeasured and reporting threshold is honest", () => {
  assert.equal(campaignMeasurementPolicy(1).tier, "unmeasured");
  assert.equal(campaignMeasurementPolicy(6).control, 0);
  assert.equal(campaignMeasurementPolicy(7).control, 1);
  assert.equal(campaignMeasurementPolicy(7).tier, "directional");
  assert.equal(campaignMeasurementPolicy(200).tier, "measurement_ready");
});

test("duplicate ids cannot inflate the holdout quota", () => {
  const arms = assignCohortArms(
    { assignmentSeed: "test-seed", splitRatio: 0.15 } as any,
    ["a", "a", "b", "c", "d", "e", "f", "g"],
  );
  assert.equal(arms.size, 7);
  assert.equal([...arms.values()].filter((arm) => arm === "CONTROL").length, 1);
});
