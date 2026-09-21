import test from "node:test";
import assert from "node:assert/strict";
import {
  assignCohortArms,
  assignStratifiedCohortArms,
  campaignMeasurementPolicy,
  estimateStratifiedCausedRevenue,
  holdoutRateFor,
  armForCandidate,
  assignmentStratumFor,
  normalizeStratum,
  planStratifiedControlQuotas,
  POOLED_SMALL_STRATUM,
  StratifiedControlSelector,
} from "./experiments";
import type { FrozenStratifiedAssignment, StratifiedCustomer } from "./experiments";

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
  assert.equal(campaignMeasurementPolicy(200).tier, "directional");
  assert.match(campaignMeasurementPolicy(20_000).warning ?? "", /pooled evidence/);
});

test("duplicate ids cannot inflate the holdout quota", () => {
  const arms = assignCohortArms({ assignmentSeed: "test-seed", splitRatio: 0.15 } as any, [
    "a",
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
  ]);
  assert.equal(arms.size, 7);
  assert.equal([...arms.values()].filter((arm) => arm === "CONTROL").length, 1);
});

test("campaign controls remain 15% independently of evidence maturity", () => {
  assert.deepEqual(holdoutRateFor("store", "newsletter:discount", "Champions", null), {
    rate: 0.15,
    evidenceReady: false,
    reason: "randomly keeping 15% of campaign candidates as a control group",
  });
  assert.equal(
    holdoutRateFor("store", "newsletter:discount", "Champions", {
      measurementReadyNonOverlappingUnits: 2,
      pooledCiLow: 10,
      pooledCiHigh: 20,
    }).rate,
    0.15
  );
  assert.equal(
    holdoutRateFor("store", "newsletter:discount", "Champions", {
      measurementReadyNonOverlappingUnits: 3,
      pooledCiLow: -1,
      pooledCiHigh: 20,
    }).rate,
    0.15
  );
  assert.equal(
    holdoutRateFor("store", "newsletter:discount", "Champions", {
      measurementReadyNonOverlappingUnits: 3,
      pooledCiLow: 10,
      pooledCiHigh: 20,
    }).rate,
    0.15
  );
});

test("stratified assignment gives exact per-stratum quotas and is retry deterministic", () => {
  const customers = [
    ...Array.from({ length: 20 }, (_, index) => ({
      customerId: `champion-${index}`,
      stratum: "Champions",
    })),
    ...Array.from({ length: 20 }, (_, index) => ({
      customerId: `risk-${index}`,
      stratum: "At risk",
    })),
  ];
  const first = assignStratifiedCohortArms({
    assignmentSeed: "stratified-seed",
    customers,
    rateForStratum: (stratum) => (stratum === "Champions" ? 0.3 : 0.15),
  });
  const retry = assignStratifiedCohortArms({
    assignmentSeed: "stratified-seed",
    customers: [...customers].reverse(),
    rateForStratum: (stratum) => (stratum === "Champions" ? 0.3 : 0.15),
  });
  assert.equal(first.strata.Champions?.controlCount, 6);
  assert.equal(first.strata["At risk"]?.controlCount, 3);
  assert.deepEqual(first.assignments, retry.assignments);
});

test("duplicates do not inflate strata and named strata smaller than ten pool safely", () => {
  const small = [
    ...Array.from({ length: 6 }, (_, index) => ({ customerId: `new-${index}`, stratum: "New" })),
    ...Array.from({ length: 4 }, (_, index) => ({
      customerId: `sleeping-${index}`,
      stratum: "Sleeping",
    })),
  ];
  const result = assignStratifiedCohortArms({
    assignmentSeed: "pooled",
    customers: [...small, small[0]!],
    rateForStratum: () => 0.3,
  });
  assert.equal(result.arms.size, 10);
  assert.deepEqual(result.strata.pooled_small, {
    customerCount: 10,
    controlCount: 3,
    holdoutRate: 0.3,
  });
  assert.equal(result.assignments["new-0"]?.stratum, "New");
  assert.equal(result.assignments["new-0"]?.assignmentStratum, "pooled_small");
});

test("a one-customer pooled stratum is never entirely held out", () => {
  const result = assignStratifiedCohortArms({
    assignmentSeed: "one",
    customers: [{ customerId: "only", stratum: "Tiny" }],
    rateForStratum: () => 0.3,
  });
  assert.equal(result.arms.get("only"), "TREATMENT");
});

test("assignment rates are bounded between ten and thirty percent", () => {
  const customers = Array.from({ length: 20 }, (_, index) => ({
    customerId: `customer-${index}`,
    stratum: "Champions",
  }));
  const high = assignStratifiedCohortArms({
    assignmentSeed: "high",
    customers,
    rateForStratum: () => 0.9,
  });
  const low = assignStratifiedCohortArms({
    assignmentSeed: "low",
    customers,
    rateForStratum: () => 0.01,
  });
  assert.deepEqual(high.strata.Champions, { customerCount: 20, controlCount: 6, holdoutRate: 0.3 });
  assert.deepEqual(low.strata.Champions, { customerCount: 20, controlCount: 2, holdoutRate: 0.1 });
});

test("stratified estimator recovers a known effect with unequal assignment rates", () => {
  // Different baselines and holdout rates would bias an unstratified estimate.
  // Within each frozen stratum, treatment is exactly ₹2/customer higher.
  const estimate = estimateStratifiedCausedRevenue([
    {
      stratum: "Champions",
      treatedCount: 70,
      treatedMean: 12,
      treatedVariance: 4,
      controlCount: 30,
      controlMean: 10,
      controlVariance: 4,
    },
    {
      stratum: "At risk",
      treatedCount: 85,
      treatedMean: 3,
      treatedVariance: 1,
      controlCount: 15,
      controlMean: 1,
      controlVariance: 1,
    },
  ]);
  assert.equal(estimate.causedRevenue, 310);
  assert.ok(estimate.ciLow < 310 && estimate.ciHigh > 310);
});

test("streaming control selection reproduces the in-memory stratified assignment", () => {
  // Deliberately mixes strata above and below the pooling threshold, so the
  // streamed census has to reach the same pooling decision as the whole cohort.
  const sizes: Array<[string | null, number]> = [
    ["Champions", 150],
    ["Loyal", 80],
    ["At risk", 40],
    ["Tiny", 4],
    ["Rare", 6],
    [null, 20],
  ];
  const labels: Array<string | null> = [];
  for (const [stratum, count] of sizes) for (let index = 0; index < count; index++) labels.push(stratum);
  // Deterministic shuffle so strata interleave across ascending customer ids
  // exactly as a keyset scan would deliver them.
  let seed = 20260919;
  for (let index = labels.length - 1; index > 0; index--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const swap = seed % (index + 1);
    [labels[index], labels[swap]] = [labels[swap]!, labels[index]!];
  }
  const customers: StratifiedCustomer[] = labels.map((stratum, index) => ({
    customerId: `cust-${String(index).padStart(6, "0")}`,
    stratum,
  }));
  const assignmentSeed = "streaming-parity";
  // 0.9 exercises the shared rate clamp on the pooled stratum.
  const rateForStratum = (stratum: string) =>
    stratum === "Champions" ? 0.3 : stratum === POOLED_SMALL_STRATUM ? 0.9 : 0.15;

  const reference = assignStratifiedCohortArms({ assignmentSeed, customers, rateForStratum });

  const census = new Map<string, number>();
  for (const customer of customers) {
    const stratum = normalizeStratum(customer.stratum);
    census.set(stratum, (census.get(stratum) ?? 0) + 1);
  }
  const plan = planStratifiedControlQuotas({ census, rateForStratum });
  const selector = new StratifiedControlSelector({ assignmentSeed, plan });
  for (const customer of customers) selector.offer(customer.customerId, customer.stratum);
  const controls = selector.controlIds();
  const streamed: Record<string, FrozenStratifiedAssignment> = {};
  for (const customer of customers) {
    streamed[customer.customerId] = selector.assignmentFor(
      customer.customerId,
      customer.stratum,
      controls
    );
  }

  assert.deepEqual(plan.strata, reference.strata);
  assert.deepEqual(streamed, reference.assignments);
  assert.deepEqual(plan.strata[POOLED_SMALL_STRATUM], {
    customerCount: 10,
    controlCount: 3,
    holdoutRate: 0.3,
  });
  // Memory is bounded by the control quotas, not by the audience.
  const quota = Object.values(plan.strata).reduce((sum, stratum) => sum + stratum.controlCount, 0);
  assert.equal(selector.retainedCount, quota);
  assert.equal(controls.size, quota);
  assert.ok(quota < customers.length / 3);
});

test("streaming selection fails closed on a repeated, reordered or uncounted candidate", () => {
  const plan = planStratifiedControlQuotas({
    census: new Map([["Champions", 20]]),
    rateForStratum: () => 0.15,
  });
  const selector = new StratifiedControlSelector({ assignmentSeed: "guard", plan });
  selector.offer("cust-000002", "Champions");
  assert.throws(() => selector.offer("cust-000002", "Champions"), /ascending id order/);
  assert.throws(() => selector.offer("cust-000001", "Champions"), /ascending id order/);
  assert.throws(() => selector.offer("cust-000009", "Unseen"), /was not counted/);
});

test("threshold-derived arms are identical to the control set and the in-memory function", () => {
  // The streaming write pass holds one cut line per stratum instead of a control
  // Set proportional to the audience. That is only sound if the cut line
  // reproduces the same arms exactly, so this pins all three against each other.
  const sizes: Array<[string | null, number]> = [
    ["Champions", 140],
    ["Loyal", 90],
    ["At risk", 55],
    ["Tiny", 3],
    ["Rare", 7],
    [null, 25],
  ];
  const labels: Array<string | null> = [];
  for (const [stratum, count] of sizes) for (let i = 0; i < count; i++) labels.push(stratum);
  let seed = 424242;
  for (let i = labels.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [labels[i], labels[j]] = [labels[j]!, labels[i]!];
  }
  const customers: StratifiedCustomer[] = labels.map((stratum, index) => ({
    customerId: `cust-${String(index).padStart(6, "0")}`,
    stratum,
  }));
  const assignmentSeed = "threshold-parity";
  const rateForStratum = (stratum: string) =>
    stratum === "Champions" ? 0.3 : stratum === POOLED_SMALL_STRATUM ? 0.25 : 0.15;

  const reference = assignStratifiedCohortArms({ assignmentSeed, customers, rateForStratum });

  const census = new Map<string, number>();
  for (const customer of customers) {
    const stratum = normalizeStratum(customer.stratum);
    census.set(stratum, (census.get(stratum) ?? 0) + 1);
  }
  const plan = planStratifiedControlQuotas({ census, rateForStratum });
  const selector = new StratifiedControlSelector({ assignmentSeed, plan });
  for (const customer of customers) selector.offer(customer.customerId, customer.stratum);
  const controls = selector.controlIds();
  const thresholds = selector.controlThresholds();

  let viaThreshold = 0;
  for (const customer of customers) {
    const assignmentStratum = assignmentStratumFor(plan, customer.stratum);
    const arm = armForCandidate({
      assignmentSeed,
      assignmentStratum,
      customerId: customer.customerId,
      threshold: thresholds.get(assignmentStratum),
    });
    assert.equal(arm, reference.arms.get(customer.customerId), `arm differs for ${customer.customerId}`);
    assert.equal(arm === "CONTROL", controls.has(customer.customerId));
    if (arm === "CONTROL") viaThreshold++;
  }
  assert.equal(viaThreshold, controls.size);
  // The cut lines are the entire retained state: one pair per stratum, not a
  // structure that grows with the audience.
  assert.ok(thresholds.size <= Object.keys(plan.strata).length);
});

test("a stratum with no control quota yields no control through the threshold path", () => {
  const census = new Map([["Solo", 1]]);
  const plan = planStratifiedControlQuotas({ census, rateForStratum: () => 0.3 });
  const selector = new StratifiedControlSelector({ assignmentSeed: "solo", plan });
  selector.offer("only-customer", "Solo");
  const thresholds = selector.controlThresholds();
  assert.equal(
    armForCandidate({
      assignmentSeed: "solo",
      assignmentStratum: assignmentStratumFor(plan, "Solo"),
      customerId: "only-customer",
      threshold: thresholds.get(assignmentStratumFor(plan, "Solo")),
    }),
    "TREATMENT"
  );
});
