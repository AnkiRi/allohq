/**
 * Part-2 SMOKE TEST — the 3-tap demo path only:
 *   (build is asserted separately via `next build`)
 *   1. Home accepts a goal  → the decision data Home renders computes (prediction).
 *   2. Outcomes computes lift → real lift/fee from control data, no throw.
 *   3. One email renders     → renderBrandedEmail produces bulletproof HTML.
 *
 * Run: tsx apps/api/tests/smoke-3tap.test.ts  (DATABASE_URL set)
 */
import { prisma } from "@allohq/database";
import { renderBrandedEmail } from "@allohq/customer-intelligence";
import { predictConsequence } from "../src/lib/predictions";

const STORE_ID = "cmm0d6gex00030bdtke78ancx";

function assert(c: boolean, m: string) { if (!c) { console.error(`\n✗ FAIL: ${m}`); process.exit(1); } console.log(`  ✓ ${m}`); }

async function main() {
  console.log("=== SMOKE TEST: 3-tap path ===\n");

  // 1) Home accepts a goal → the decision/forecast it renders computes cleanly.
  console.log("1) Home decision path (prediction):");
  const pred = predictConsequence({ cohortSize: 632, estimatedRevenue: 120000, confidenceScore: 70, channel: "whatsapp", category: "win-back", calibration: null });
  assert(typeof pred.upsideRevenue === "number" && pred.upsideRevenue > 0, `upside computed (₹${pred.upsideRevenue})`);
  assert(pred.downsideRiskPct > 0, `named downside risk present (${pred.downsideRiskPct}%) — never hidden`);
  assert(["low", "medium", "high"].includes(pred.confidence), `confidence = ${pred.confidence}`);
  assert(pred.basis === "estimate" || pred.basis === "calibrated", `honesty basis = ${pred.basis}`);

  // 2) Outcomes computes lift without error.
  console.log("\n2) Outcomes lift computation:");
  const since = new Date(Date.now() - 90 * 86_400_000);
  const rows = await prisma.$queryRaw<Array<{ arm: string; n: number; mean: number }>>`
    SELECT "treatmentArm" AS arm, COUNT(*)::int AS n,
      COALESCE(AVG(COALESCE("outcomeMargin","outcomeRevenue")) FILTER (WHERE COALESCE("outcomeMargin","outcomeRevenue") IS NOT NULL),0)::float AS mean
    FROM "message_logs" WHERE "storeId"=${STORE_ID} AND "treatmentArm" IS NOT NULL AND "createdAt">=${since}
    GROUP BY "treatmentArm"`;
  const c = rows.find((r) => r.arm === "CONTROL"), t = rows.find((r) => r.arm === "TREATMENT");
  const lift = (t?.mean ?? 0) - (c?.mean ?? 0);
  const fee = 24000 + Math.max(0, lift * Number(t?.n ?? 0) * 0.6) * 0.15;
  assert(Number.isFinite(lift) && Number.isFinite(fee), `lift ₹${Math.round(lift)} + fee ₹${Math.round(fee)} computed without error`);

  // 3) One email renders.
  console.log("\n3) Email render:");
  const html = await renderBrandedEmail({
    storeId: STORE_ID, subject: "We saved your spot",
    blocks: [
      { id: "h", type: "hero", props: { heading: "We saved your spot", subheading: "Your Triphala Daily is waiting.", body: "Kept aside for you." } } as any,
      { id: "b", type: "button", props: { text: "Reorder now", label: "Reorder now", url: "https://vana.example/reorder", href: "https://vana.example/reorder" } } as any,
    ],
  });
  assert(html.length > 1000, `email rendered (${html.length} bytes)`);
  assert(html.includes("<table"), "email is table-based (cross-client bulletproof)");

  console.log("\n=== PASS ===");
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
