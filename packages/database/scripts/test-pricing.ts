/**
 * Part-2 PRICING TEST — assert fee = BASE + performance-on-(treatment−control)
 * lift, on incremental MARGIN; NEVER pure-incremental, NEVER on gross revenue.
 *
 * The fee formula lives inline in analytics.ts `controlLift` (not importable
 * without an out-of-scope refactor), so this test mirrors that exact formula
 * (BASE_MONTHLY_FEE=24_000, PERFORMANCE_RATE=0.15) and asserts its PROPERTIES,
 * then cross-checks against the LIVE Vana arm means/counts.
 *
 * Run: tsx packages/database/scripts/test-pricing.ts  (DATABASE_URL set)
 */
import { prisma } from "../src/index";

const STORE_ID = "cmm0d6gex00030bdtke78ancx";
const BASE = 24_000, RATE = 0.15;

function assert(c: boolean, m: string) { if (!c) { console.error(`\n✗ FAIL: ${m}`); process.exit(1); } console.log(`  ✓ ${m}`); }

// Mirror of controlLift's fee math (analytics.ts:416-432).
function computeFee(controlMean: number, treatmentMean: number, treatmentCount: number, contributionMargin: number, basis: "margin" | "revenue") {
  const liftPerCustomer = treatmentMean - controlMean;
  const incrementalTotal = liftPerCustomer * treatmentCount;
  const incrementalMargin = basis === "margin" ? incrementalTotal : incrementalTotal * contributionMargin;
  const performanceFee = Math.max(0, incrementalMargin) * RATE;
  return { liftPerCustomer, incrementalMargin, performanceFee, totalFee: BASE + performanceFee };
}

async function main() {
  console.log("=== PRICING TEST: base + performance-on-lift, never gross/pure-incremental ===\n");

  console.log("Property assertions:");
  // 1) Zero lift (equal arms) → only the base fee. Proves NOT pure-incremental.
  const zero = computeFee(2000, 2000, 1800, 0.6, "revenue");
  assert(zero.performanceFee === 0 && zero.totalFee === BASE, `zero lift → fee = base ₹${BASE} (not pure-incremental; base always present)`);

  // 2) Huge GROSS but zero lift → still just base. Proves fee is NOT on gross revenue.
  const grossNoLift = computeFee(50000, 50000, 5000, 0.6, "revenue");
  assert(grossNoLift.totalFee === BASE, `huge gross (₹50k×5000) but zero lift → fee = base only (NOT on gross)`);

  // 3) Positive lift → performance = RATE × (treatment−control) × count × margin.
  const pos = computeFee(1700, 2150, 1800, 0.6, "revenue");
  const expected = BASE + RATE * (2150 - 1700) * 1800 * 0.6;
  assert(Math.round(pos.totalFee) === Math.round(expected), `fee = base + ${RATE * 100}%×(Δ${2150 - 1700}×1800×0.6) = ₹${Math.round(expected)}`);
  assert(pos.totalFee > BASE, "positive lift adds a performance fee on top of base");

  // 4) Performance is on LIFT vs control, not gross: fee ≪ RATE×gross.
  const gross = RATE * 2150 * 1800;
  assert(pos.performanceFee < 0.5 * gross, `perf fee ₹${Math.round(pos.performanceFee)} ≪ rate×gross ₹${Math.round(gross)} (on lift, not gross)`);

  // 5) Cross-check against the LIVE seeded experiment.
  console.log("\nLive cross-check (Vana decision_records):");
  const since = new Date(Date.now() - 90 * 86_400_000);
  const rows = await prisma.$queryRaw<Array<{ arm: string; n: number; mean: number }>>`
    SELECT "treatmentArm" AS arm, COUNT(*)::int AS n,
      COALESCE(AVG(COALESCE("outcomeMargin","outcomeRevenue")) FILTER (WHERE COALESCE("outcomeMargin","outcomeRevenue") IS NOT NULL),0)::float AS mean
    FROM "message_logs" WHERE "storeId"=${STORE_ID} AND "treatmentArm" IS NOT NULL AND "createdAt">=${since}
    GROUP BY "treatmentArm"`;
  const c = rows.find((r) => r.arm === "CONTROL"), t = rows.find((r) => r.arm === "TREATMENT");
  assert(!!c && !!t, "live CONTROL + TREATMENT arms exist to price against");
  const live = computeFee(c!.mean, t!.mean, Number(t!.n), 0.6, "revenue");
  console.log(`  controlMean ₹${Math.round(c!.mean)} treatmentMean ₹${Math.round(t!.mean)} lift ₹${Math.round(live.liftPerCustomer)} count ${t!.n}`);
  console.log(`  FEE = base ₹${BASE} + perf ₹${Math.round(live.performanceFee)} = TOTAL ₹${Math.round(live.totalFee)}`);
  const liveGross = RATE * t!.mean * Number(t!.n);
  assert(live.totalFee > BASE, "live fee includes both base and performance");
  assert(live.performanceFee < liveGross, `live perf ₹${Math.round(live.performanceFee)} < rate×gross ₹${Math.round(liveGross)} (never gross)`);

  console.log("\n=== PASS ===");
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
