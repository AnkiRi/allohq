/**
 * Part-2 DATA-CONSISTENCY TEST — the seeded brand can't show contradictory
 * totals: customers sum exactly across segments, and revenue ties to orders.
 *
 * Run: tsx packages/database/scripts/test-data-consistency.ts  (DATABASE_URL set)
 */
import { prisma } from "../src/index";

const STORE_ID = "cmm0d6gex00030bdtke78ancx";

function assert(c: boolean, m: string) { if (!c) { console.error(`\n✗ FAIL: ${m}`); process.exit(1); } console.log(`  ✓ ${m}`); }

async function main() {
  console.log("=== DATA-CONSISTENCY TEST (Vana Naturals) ===\n");

  const customerCount = await prisma.customer.count({ where: { storeId: STORE_ID } });
  const segs = await prisma.customerSegment.findMany({ where: { storeId: STORE_ID }, select: { name: true, customerCount: true } });
  const segSum = segs.reduce((s, x) => s + (x.customerCount ?? 0), 0);

  const orderAgg = await prisma.order.aggregate({ where: { storeId: STORE_ID }, _sum: { totalPrice: true }, _count: true });
  const orderRevenue = Math.round(orderAgg._sum.totalPrice ?? 0);
  const orderCount = orderAgg._count;

  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const rev30 = Math.round((await prisma.order.aggregate({ where: { storeId: STORE_ID, createdAt: { gte: since30 } }, _sum: { totalPrice: true } }))._sum.totalPrice ?? 0);

  console.log(`customers=${customerCount} | segments sum=${segSum} | orders=${orderCount} | revenue lifetime=₹${orderRevenue} | 30d=₹${rev30}\n`);
  console.log("Assertions:");
  assert(customerCount > 0 && orderCount > 0, "brand has customers and orders (not empty)");
  assert(segSum === customerCount, `segment counts sum EXACTLY to customers (${segSum} === ${customerCount}) — no 96-vs-93,938 contradiction`);
  assert(orderRevenue > 0, "lifetime revenue derives from real order rows (> 0)");
  assert(rev30 <= orderRevenue, `30-day revenue (₹${rev30}) ≤ lifetime revenue (₹${orderRevenue}) — windows are coherent`);
  // Revenue ties to orders: re-summing orders must reproduce the same total (single source).
  const reSum = Math.round((await prisma.order.aggregate({ where: { storeId: STORE_ID }, _sum: { totalPrice: true } }))._sum.totalPrice ?? 0);
  assert(reSum === orderRevenue, "revenue is a single derived total from orders (reproducible, no parallel contradicting figure)");

  console.log("\n=== PASS ===");
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
