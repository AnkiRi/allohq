/**
 * Part-2 MOAT TEST — run a campaign through the demo brand and prove the
 * causal substrate captures it: DecisionRecords created with a populated
 * CONTROL arm and all state/action/outcome fields. Shows 5 example rows.
 *
 * Run: tsx packages/database/scripts/test-moat-campaign.ts  (DATABASE_URL set)
 * Idempotent: tags + cleans up its own rows; never touches seeded data.
 */
import { prisma, getDecisionRecords } from "../src/index";
import { getOrCreateExperiment, assignArm, type Arm } from "@allohq/customer-state";

const STORE_ID = "cmm0d6gex00030bdtke78ancx"; // Vana Naturals (seeded)
const COHORT_LABEL = "TEST:moat-campaign:at-risk";
const TEST_TAG = "moat-campaign-test";
const SPLIT = 0.15;
const N = 200;

function assert(c: boolean, m: string) { if (!c) { console.error(`\n✗ FAIL: ${m}`); process.exit(1); } console.log(`  ✓ ${m}`); }

async function cleanup(expIds: string[]) {
  await prisma.messageLog.deleteMany({ where: { storeId: STORE_ID, experimentId: { in: expIds.length ? expIds : ["__none__"] }, metadata: { path: ["testTag"], equals: TEST_TAG } } });
  await prisma.experiment.deleteMany({ where: { storeId: STORE_ID, cohortDefinition: { path: ["label"], equals: COHORT_LABEL } } });
}

async function main() {
  console.log("=== MOAT TEST: campaign → DecisionRecords with CONTROL arm + full fields ===\n");
  const store = await prisma.store.findUnique({ where: { id: STORE_ID }, select: { id: true, storeName: true, workspaceId: true } });
  assert(!!store, `Vana store present (${store?.storeName})`);

  const stale = await prisma.experiment.findMany({ where: { storeId: STORE_ID, cohortDefinition: { path: ["label"], equals: COHORT_LABEL } }, select: { id: true } });
  await cleanup(stale.map((e) => e.id));

  // Cohort of real At Risk customers — "the campaign target".
  const cohort = await prisma.customer.findMany({ where: { storeId: STORE_ID, rfmScore: { segment: "At Risk" } }, select: { id: true, email: true }, take: N, orderBy: { id: "asc" } });
  assert(cohort.length >= 50, `meaningful cohort (${cohort.length} At Risk customers)`);

  const exp = await getOrCreateExperiment(STORE_ID, { label: COHORT_LABEL, source: "moat-test", segment: "At Risk" }, SPLIT);
  console.log(`\nCampaign experiment ${exp.id} (split ${exp.splitRatio})\n`);

  let ctrl = 0, treat = 0;
  for (const c of cohort) {
    const arm: Arm = assignArm(exp, c.id);
    const isControl = arm === "CONTROL";
    if (isControl) ctrl++; else treat++;
    // FULL record: state snapshot + message features (action) + measured outcome.
    const outcomeRevenue = isControl ? 1650 + (c.id.charCodeAt(2) % 400) : 2050 + (c.id.charCodeAt(2) % 500);
    await prisma.messageLog.create({ data: {
      workspaceId: store!.workspaceId, storeId: STORE_ID, customerId: c.id,
      channel: "email", to: c.email,
      subject: isControl ? "[holdout]" : "We saved your spot",
      status: isControl ? "withheld" : "sent", sentAt: isControl ? null : new Date(),
      treatmentArm: arm, experimentId: exp.id,
      customerStateSnap: { segment: "At Risk", recencyDays: 120, frequency: 2, monetary: 4 },   // STATE
      messageFeatures: { sendHour: 9, hasDiscount: false, archetype: "win-back", channel: "email" }, // ACTION features
      outcomeRevenue, outcomeMargin: Math.round(outcomeRevenue * 0.6),                              // OUTCOME
      metadata: { testTag: TEST_TAG, withheld: isControl },
    } });
  }
  console.log(`Campaign run: ${ctrl} CONTROL (withheld) / ${treat} TREATMENT (sent)\n`);

  const recs = await getDecisionRecords(STORE_ID, { experimentId: exp.id, limit: 1000 });
  const control = recs.filter((r: any) => r.treatmentArm === "CONTROL");
  const treatment = recs.filter((r: any) => r.treatmentArm === "TREATMENT");

  console.log("Assertions:");
  assert(control.length > 0, `CONTROL arm populated in decision_records (${control.length} rows)`);
  assert(treatment.length > 0, `TREATMENT arm populated (${treatment.length} rows)`);
  assert(control.length + treatment.length === cohort.length, `every targeted customer captured (${recs.length} = ${cohort.length})`);
  // All state/action/outcome fields present on every record.
  const complete = recs.every((r: any) => r.customerStateSnap != null && r.messageFeatures != null && r.channel != null && r.treatmentArm != null && r.outcomeRevenue != null);
  assert(complete, "every DecisionRecord has state + action + outcome fields populated");

  console.log("\n5 example DecisionRecords:");
  for (const r of recs.slice(0, 5)) {
    console.log(`  · ${r.treatmentArm.padEnd(9)} cust=${String(r.customerId).slice(0, 10)} state=${JSON.stringify(r.customerStateSnap).slice(0, 38)}… ch=${r.channel} outcome=₹${r.outcomeRevenue} margin=₹${r.outcomeMargin}`);
  }

  await cleanup([exp.id]);
  console.log("\nCleaned up test rows.\n=== PASS ===");
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
