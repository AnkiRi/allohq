import test from "node:test";
import assert from "node:assert/strict";
import {
  assignCohortArms,
  assignStratifiedCohortArms,
  campaignMeasurementPolicy,
  estimateStratifiedCausedRevenue,
  holdoutRateFor,
} from "./experiments";

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

test("new families stay at 30% until three trustworthy units exclude zero", () => {
  assert.deepEqual(holdoutRateFor("store", "newsletter:discount", "Champions", null), {
    rate: 0.30,
    evidenceReady: false,
    reason: "new campaign type - holding back 30% until proven",
  });
  assert.equal(holdoutRateFor("store", "newsletter:discount", "Champions", {
    measurementReadyNonOverlappingUnits: 2, pooledCiLow: 10, pooledCiHigh: 20,
  }).rate, 0.30);
  assert.equal(holdoutRateFor("store", "newsletter:discount", "Champions", {
    measurementReadyNonOverlappingUnits: 3, pooledCiLow: -1, pooledCiHigh: 20,
  }).rate, 0.30);
  assert.equal(holdoutRateFor("store", "newsletter:discount", "Champions", {
    measurementReadyNonOverlappingUnits: 3, pooledCiLow: 10, pooledCiHigh: 20,
  }).rate, 0.15);
});

test("stratified assignment gives exact per-stratum quotas and is retry deterministic", () => {
  const customers = [
    ...Array.from({ length: 20 }, (_, index) => ({ customerId: `champion-${index}`, stratum: "Champions" })),
    ...Array.from({ length: 20 }, (_, index) => ({ customerId: `risk-${index}`, stratum: "At risk" })),
  ];
  const first = assignStratifiedCohortArms({
    assignmentSeed: "stratified-seed", customers,
    rateForStratum: (stratum) => stratum === "Champions" ? 0.30 : 0.15,
  });
  const retry = assignStratifiedCohortArms({
    assignmentSeed: "stratified-seed", customers: [...customers].reverse(),
    rateForStratum: (stratum) => stratum === "Champions" ? 0.30 : 0.15,
  });
  assert.equal(first.strata.Champions?.controlCount, 6);
  assert.equal(first.strata["At risk"]?.controlCount, 3);
  assert.deepEqual(first.assignments, retry.assignments);
});

test("duplicates do not inflate strata and named strata smaller than ten pool safely", () => {
  const small = [
    ...Array.from({ length: 6 }, (_, index) => ({ customerId: `new-${index}`, stratum: "New" })),
    ...Array.from({ length: 4 }, (_, index) => ({ customerId: `sleeping-${index}`, stratum: "Sleeping" })),
  ];
  const result = assignStratifiedCohortArms({
    assignmentSeed: "pooled", customers: [...small, small[0]!], rateForStratum: () => 0.30,
  });
  assert.equal(result.arms.size, 10);
  assert.deepEqual(result.strata.pooled_small, { customerCount: 10, controlCount: 3, holdoutRate: 0.30 });
  assert.equal(result.assignments["new-0"]?.stratum, "New");
  assert.equal(result.assignments["new-0"]?.assignmentStratum, "pooled_small");
});

test("a one-customer pooled stratum is never entirely held out", () => {
  const result = assignStratifiedCohortArms({
    assignmentSeed: "one", customers: [{ customerId: "only", stratum: "Tiny" }], rateForStratum: () => 0.30,
  });
  assert.equal(result.arms.get("only"), "TREATMENT");
});

test("assignment rates are bounded between ten and thirty percent", () => {
  const customers = Array.from({ length: 20 }, (_, index) => ({ customerId: `customer-${index}`, stratum: "Champions" }));
  const high = assignStratifiedCohortArms({ assignmentSeed: "high", customers, rateForStratum: () => 0.90 });
  const low = assignStratifiedCohortArms({ assignmentSeed: "low", customers, rateForStratum: () => 0.01 });
  assert.deepEqual(high.strata.Champions, { customerCount: 20, controlCount: 6, holdoutRate: 0.30 });
  assert.deepEqual(low.strata.Champions, { customerCount: 20, controlCount: 2, holdoutRate: 0.10 });
});

test("stratified estimator recovers a known effect with unequal assignment rates", () => {
  // Different baselines and holdout rates would bias an unstratified estimate.
  // Within each frozen stratum, treatment is exactly ₹2/customer higher.
  const estimate = estimateStratifiedCausedRevenue([
    { stratum: "Champions", treatedCount: 70, treatedMean: 12, treatedVariance: 4, controlCount: 30, controlMean: 10, controlVariance: 4 },
    { stratum: "At risk", treatedCount: 85, treatedMean: 3, treatedVariance: 1, controlCount: 15, controlMean: 1, controlVariance: 1 },
  ]);
  assert.equal(estimate.causedRevenue, 310);
  assert.ok(estimate.ciLow < 310 && estimate.ciHigh > 310);
});
