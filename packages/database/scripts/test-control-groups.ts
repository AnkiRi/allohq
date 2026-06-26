/**
 * Integration test for the causal-data moat: control-group assignment +
 * DecisionRecord substrate.
 *
 * Run with: tsx packages/database/scripts/test-control-groups.ts
 * (DATABASE_URL must point at the local Postgres.)
 *
 * What it proves, against the REAL local DB and the Vana Naturals seed:
 *   1. A holdout Experiment is created for a cohort of real "At Risk" customers.
 *   2. Each customer is assigned an arm deterministically; CONTROL rows are
 *      written as "withheld" MessageLogs, TREATMENT rows as "sent".
 *   3. The decision_records view (via getDecisionRecords) returns both arms,
 *      the control fraction ≈ splitRatio, and re-running assignArm is stable.
 *
 * Idempotent: it tags its rows with a fixed test cohort label + metadata so it
 * can re-run and clean up after itself without touching seeded/production data.
 */
import { prisma, getDecisionRecords } from "../src/index";
import {
  getOrCreateExperiment,
  assignArm,
  type Arm,
} from "@allohq/customer-state";

const STORE_ID = "cmm0d6gex00030bdtke78ancx"; // Vana Naturals (seeded)
const SPLIT_RATIO = 0.15;
const COHORT_LABEL = "TEST:control-groups:at-risk"; // tag so we can clean up
const TEST_TAG = "control-group-integration-test";
const COHORT_SIZE = 200;
const TOLERANCE = 0.07; // allow ±7pp around the split ratio for finite samples

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`\n✗ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

async function cleanup(experimentIds: string[]): Promise<void> {
  // Delete only rows this test created (tagged via metadata + experiment).
  await prisma.messageLog.deleteMany({
    where: {
      storeId: STORE_ID,
      experimentId: { in: experimentIds.length ? experimentIds : ["__none__"] },
      metadata: { path: ["testTag"], equals: TEST_TAG },
    },
  });
  await prisma.experiment.deleteMany({
    where: {
      storeId: STORE_ID,
      cohortDefinition: { path: ["label"], equals: COHORT_LABEL },
    },
  });
}

async function main(): Promise<void> {
  console.log("=== Control-group / DecisionRecord integration test ===\n");

  const store = await prisma.store.findUnique({
    where: { id: STORE_ID },
    select: { id: true, storeName: true, workspaceId: true },
  });
  assert(!!store, `Vana store ${STORE_ID} must exist (seed present)`);
  console.log(`Store: ${store!.storeName} (${store!.id})`);

  // --- Pre-clean any leftovers from a previous run --------------------------
  const stale = await prisma.experiment.findMany({
    where: {
      storeId: STORE_ID,
      cohortDefinition: { path: ["label"], equals: COHORT_LABEL },
    },
    select: { id: true },
  });
  await cleanup(stale.map((e) => e.id));

  // --- 1. Pick a cohort of real At Risk customers ---------------------------
  const atRisk = await prisma.customer.findMany({
    where: { storeId: STORE_ID, rfmScore: { segment: "At Risk" } },
    select: { id: true, email: true },
    take: COHORT_SIZE,
    orderBy: { id: "asc" }, // stable ordering for reproducibility
  });
  assert(
    atRisk.length >= 50,
    `expected a meaningful At Risk cohort, got ${atRisk.length}`,
  );
  console.log(`Cohort: ${atRisk.length} At Risk customers\n`);

  // --- 2. getOrCreateExperiment once, then assignArm per customer -----------
  const experiment = await getOrCreateExperiment(
    STORE_ID,
    {
      label: COHORT_LABEL,
      source: "integration-test",
      segment: "At Risk",
    },
    SPLIT_RATIO,
  );
  console.log(
    `Experiment: ${experiment.id} (split=${experiment.splitRatio}, seed=${experiment.assignmentSeed.slice(0, 12)}…)\n`,
  );

  // Capture first assignment pass for determinism check.
  const firstPass = new Map<string, Arm>();
  let writtenControl = 0;
  let writtenTreatment = 0;

  for (const c of atRisk) {
    const arm = assignArm(experiment, c.id);
    firstPass.set(c.id, arm);

    if (arm === "CONTROL") {
      writtenControl++;
      await prisma.messageLog.create({
        data: {
          workspaceId: store!.workspaceId,
          storeId: STORE_ID,
          customerId: c.id,
          channel: "email",
          to: c.email,
          subject: "[holdout]",
          status: "withheld",
          treatmentArm: "CONTROL",
          experimentId: experiment.id,
          metadata: { testTag: TEST_TAG, withheld: true },
        },
      });
    } else {
      writtenTreatment++;
      await prisma.messageLog.create({
        data: {
          workspaceId: store!.workspaceId,
          storeId: STORE_ID,
          customerId: c.id,
          channel: "email",
          to: c.email,
          subject: "We miss you — here's 15% off",
          status: "sent",
          sentAt: new Date(),
          treatmentArm: "TREATMENT",
          experimentId: experiment.id,
          metadata: { testTag: TEST_TAG },
        },
      });
    }
  }
  console.log(
    `Wrote MessageLogs: ${writtenControl} CONTROL (withheld), ${writtenTreatment} TREATMENT (sent)\n`,
  );

  // --- 3. Query decision_records view and assert ----------------------------
  const records = await getDecisionRecords(STORE_ID, {
    experimentId: experiment.id,
    limit: 1000,
  });
  console.log(`decision_records rows for experiment: ${records.length}`);

  const control = records.filter((r) => r.treatmentArm === "CONTROL");
  const treatment = records.filter((r) => r.treatmentArm === "TREATMENT");

  assert(control.length > 0, "must have CONTROL rows in decision_records");
  assert(treatment.length > 0, "must have TREATMENT rows in decision_records");
  assert(
    control.length + treatment.length === atRisk.length,
    `stitched row count (${control.length + treatment.length}) must equal cohort (${atRisk.length})`,
  );

  // Every record must expose the feature snapshots + experiment linkage fields.
  for (const r of records.slice(0, 5)) {
    assert(r.storeId === STORE_ID, "decision record storeId must match");
    assert(r.experimentId === experiment.id, "decision record experimentId must match");
    assert(
      "customerStateSnap" in r && "messageFeatures" in r,
      "decision record must expose feature snapshot columns",
    );
  }

  const controlFraction = control.length / records.length;
  console.log(
    `Control fraction: ${(controlFraction * 100).toFixed(1)}% (target ${(SPLIT_RATIO * 100).toFixed(0)}%, tol ±${(TOLERANCE * 100).toFixed(0)}pp)`,
  );
  assert(
    Math.abs(controlFraction - SPLIT_RATIO) <= TOLERANCE,
    `control fraction ${controlFraction.toFixed(3)} must be within ${TOLERANCE} of ${SPLIT_RATIO}`,
  );

  // --- Determinism: re-running assignArm yields identical arms ---------------
  let mismatches = 0;
  for (const c of atRisk) {
    const again = assignArm(experiment, c.id);
    if (again !== firstPass.get(c.id)) mismatches++;
  }
  assert(mismatches === 0, `assignArm must be deterministic (got ${mismatches} mismatches)`);
  console.log(`Determinism: ${atRisk.length}/${atRisk.length} arms reproduced exactly\n`);

  // --- Idempotency of experiment lookup -------------------------------------
  const again = await getOrCreateExperiment(
    STORE_ID,
    { label: COHORT_LABEL, source: "integration-test", segment: "At Risk" },
    SPLIT_RATIO,
  );
  assert(
    again.id === experiment.id,
    "getOrCreateExperiment must reuse the open experiment for the same cohort",
  );

  // --- Summary --------------------------------------------------------------
  console.log(
    `✓ DecisionRecords accumulating: ${control.length} CONTROL / ${treatment.length} TREATMENT (control ≈ ${(controlFraction * 100).toFixed(1)}%)`,
  );

  // --- Cleanup (keep DB clean / re-runnable) --------------------------------
  await cleanup([experiment.id]);
  console.log("Cleaned up test rows.\n");
  console.log("=== PASS ===");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
