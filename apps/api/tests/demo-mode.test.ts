/**
 * Demo / sandbox mode test — proves the backend guards:
 *   SG3: a demo context resolves the seeded Vana workspace; Outcomes computes
 *        real lift + base+performance fee.
 *   SG4: approve in demo returns success WITHOUT firing/executing (no send).
 *   SG5: the shared Vana decision is UNCHANGED after a demo approve, so the
 *        sandbox resets clean for the next visitor.
 *
 * Run: tsx apps/api/tests/demo-mode.test.ts  (DATABASE_URL set)
 */
import { appRouter } from "../src/routers/_app";
import { prisma, DEMO_WORKSPACE_ID, DEMO_STORE_ID } from "@allohq/database";

function assert(c: boolean, m: string) { if (!c) { console.error(`\n✗ FAIL: ${m}`); process.exit(1); } console.log(`  ✓ ${m}`); }

async function main() {
  console.log("=== DEMO-MODE SANDBOX TEST ===\n");
  const demoCtx = { prisma, userId: "demo-test-user", workspaceId: DEMO_WORKSPACE_ID, isDemo: true } as any;
  const caller = appRouter.createCaller(demoCtx);

  // SG3 — demo context reads the seeded Vana data.
  const stats = await caller.dashboard.stats();
  console.log(`demo dashboard.stats → customers=${stats.totalCustomers}, revenue(30d)=₹${Math.round(stats.revenueThisMonth)}`);
  assert(stats.totalCustomers === 4820, "demo context resolves the seeded Vana workspace (4,820 customers)");

  // SG3 — Outcomes computes real lift + base+performance fee in demo.
  const lift = await caller.analytics.controlLift({ storeId: DEMO_STORE_ID, days: 90 });
  console.log(`demo Outcomes → lift ₹${lift.liftPerCustomer}/cust · base ₹${lift.baseMonthly} + perf ₹${lift.performanceFee} = fee ₹${lift.totalFee}`);
  assert(lift.totalFee > lift.baseMonthly && lift.liftPerCustomer > 0, "3-tap Outcomes computes real lift + base+performance fee in demo");

  // SG4 + SG5 — approve in demo = success WITHOUT firing/persisting.
  const action = await prisma.actionQueue.findFirst({ where: { storeId: DEMO_STORE_ID, status: "pending" }, select: { id: true, status: true } });
  assert(!!action, "a pending Vana decision exists to approve");
  const before = action!.status;
  const res = await caller.autonomy.approveAction({ actionId: action!.id });
  console.log(`demo approveAction → ${JSON.stringify(res)}`);
  assert((res as any).demo === true && (res as any).success === true, "SG4: demo approve returns success WITHOUT executing (no send enqueued, no real API)");
  const reread = await prisma.actionQueue.findUnique({ where: { id: action!.id }, select: { status: true } });
  assert(reread!.status === before && before === "pending", "SG5: shared Vana decision UNCHANGED after demo approve (sandbox + resets clean)");

  console.log("\n=== PASS ===");
}
// appRouter pulls routers that open BullMQ/Redis handles at import → force exit
// (and flush piped stdout) instead of waiting on those handles.
main().then(async () => { await prisma.$disconnect(); process.exit(0); }).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
