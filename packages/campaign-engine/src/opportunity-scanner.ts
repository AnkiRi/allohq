import { prisma, Prisma } from "@allohq/database";
import type { CampaignOpportunity } from "./types";
import { estimateRevenue } from "./revenue-estimator";
import { OpportunityAudienceDigest } from "./opportunity-dedupe";
import { getUpcomingEvents } from "./calendar-awareness";

/**
 * Scan a store for actionable campaign opportunities.
 * Returns a prioritised list sorted by urgency × estimated revenue.
 */
/** What one scanner cost. Attribution is only exact in sequential mode. */
export interface OpportunityScanTelemetry {
  scanner: string;
  durationMs: number;
  /** Postgres transactions attributable to this scanner. */
  transactions: number;
  opportunities: number;
  /**
   * Heap still held after this scanner settled, in bytes. Null when the
   * process has no collector, because without one the reading would be
   * uncollected garbage rather than retention.
   */
  retainedHeapBytes: number | null;
}

async function transactionCounter(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT (xact_commit + xact_rollback)::bigint AS total
    FROM pg_stat_database WHERE datname = current_database()
  `;
  return Number(rows[0]?.total ?? 0);
}

export async function scanOpportunities(
  storeId: string,
  options: {
    /**
     * Collect per-scanner cost. Supplying this runs the scanners one after
     * another rather than together, because concurrent scans interleave their
     * queries and per-scanner attribution would be guesswork. Wall-clock
     * durations therefore differ from a normal concurrent run; the query and
     * transaction counts are the same work either way.
     */
    telemetry?: OpportunityScanTelemetry[];
  } = {}
): Promise<CampaignOpportunity[]> {
  const opportunities: CampaignOpportunity[] = [];
  const scanners: Array<[string, (storeId: string, into: CampaignOpportunity[]) => Promise<void>]> = [
    ["at_risk_winback", scanAtRiskCustomers],
    ["repurchase_window", scanRepurchaseWindows],
    ["new_arrival", scanNewArrivals],
    ["re_engagement", scanReEngagement],
    ["vip_milestone", scanVipMilestones],
    ["low_stock", scanLowStock],
    ["seasonal", scanSeasonal],
    ["cross_sell", scanCrossSell],
  ];

  if (options.telemetry) {
    const collector = (globalThis as Record<string, unknown>)["gc"];
    const settle = async (): Promise<number | null> => {
      if (typeof collector !== "function") return null;
      for (let i = 0; i < 2; i += 1) {
        (collector as () => void)();
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      return process.memoryUsage().heapUsed;
    };
    for (const [scanner, run] of scanners) {
      const before = opportunities.length;
      const heapBefore = await settle();
      const txBefore = await transactionCounter();
      const startedAt = process.hrtime.bigint();
      await run(storeId, opportunities);
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const transactions = (await transactionCounter()) - txBefore;
      const heapAfter = await settle();
      options.telemetry.push({
        scanner,
        durationMs,
        transactions,
        opportunities: opportunities.length - before,
        retainedHeapBytes:
          heapBefore !== null && heapAfter !== null ? heapAfter - heapBefore : null,
      });
    }
  } else {
    await Promise.all(scanners.map(([, run]) => run(storeId, opportunities)));
  }

  // Sort by urgency descending
  opportunities.sort((a, b) => b.urgency - a.urgency);

  console.log(
    `[opportunity-scanner] Found ${opportunities.length} opportunities for store ${storeId}`
  );
  return opportunities;
}

/**
 * Page a store's customer states by primary key, streaming the audience digest
 * instead of collecting ids.
 *
 * These scans were unbounded: a store with hundreds of thousands of matching
 * customers loaded every row, then built an array of that many ids purely so
 * the dedupe fingerprint could hash it. The digest is byte-identical to hashing
 * the array, so fingerprints are unchanged and nothing is re-created.
 */
async function streamCustomerStateAudience(
  where: Prisma.CustomerStateWhereInput,
  base: Pick<CampaignOpportunity, "storeId" | "type">,
  onRow?: (row: { customerId: string; churnRisk: number | null; vipLevel: string | null }) => void
): Promise<{ digest: OpportunityAudienceDigest; count: number }> {
  const digest = new OpportunityAudienceDigest(base);
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.customerState.findMany({
      where: cursor ? { AND: [where, { customerId: { gt: cursor } }] } : where,
      select: { customerId: true, churnRisk: true, vipLevel: true },
      orderBy: { customerId: "asc" },
      take: 2_000,
    });
    if (page.length === 0) break;
    for (const row of page) {
      digest.add(row.customerId);
      onRow?.(row);
    }
    cursor = page[page.length - 1]!.customerId;
    if (page.length < 2_000) break;
  }
  return { digest, count: digest.count };
}

async function scanAtRiskCustomers(storeId: string, results: CampaignOpportunity[]): Promise<void> {
  const base = { storeId, type: "at_risk_winback" as const };
  let churnRiskTotal = 0;
  const { digest, count } = await streamCustomerStateAudience(
    { storeId, OR: [{ lifecycleStage: "at_risk" }, { churnRisk: { gt: 0.6 } }] },
    base,
    (row) => {
      churnRiskTotal += row.churnRisk ?? 0.7;
    }
  );

  if (count === 0) return;

  const avgChurnRisk = churnRiskTotal / count;
  const estimate = await estimateRevenue(storeId, count, "at_risk_winback");

  const opportunity: CampaignOpportunity = {
    type: "at_risk_winback",
    storeId,
    segmentName: "At Risk",
    customerCount: count,
    reasoning: `${count} customers at risk of churning (avg risk ${(avgChurnRisk * 100).toFixed(0)}%). Win-back campaign recommended.`,
    urgency: Math.min(95, Math.round(avgChurnRisk * 100)),
    estimatedRevenue: estimate,
  };
  // Byte-identical to hashing the id array this used to build, so rescans
  // still dedupe against opportunities recorded before the change.
  opportunity.audienceFingerprint = digest.finish(opportunity);
  results.push(opportunity);
}

/**
 * Page the distinct customers who bought a product, in ascending customer id.
 *
 * The order-driven scans each loaded every matching order line for a store and
 * deduplicated in Node, purely to count customers and hash their ids. Postgres
 * does the distinct, the ordering and — for cross-sell — the exclusion, and the
 * scan keeps only a digest and a count.
 *
 * `excludeProductId` makes it an anti-join: customers who bought the first
 * product and have never bought the second. That was two full arrays and a Set
 * difference in process.
 */
async function streamProductBuyers(
  storeId: string,
  productIds: string[],
  base: Pick<CampaignOpportunity, "storeId" | "type">,
  options: {
    orderedAfter?: Date;
    orderedBefore?: Date;
    excludeProductId?: string;
  } = {}
): Promise<{ digest: OpportunityAudienceDigest; count: number }> {
  const digest = new OpportunityAudienceDigest(base);
  if (productIds.length === 0) return { digest, count: 0 };

  // Conditions are composed, not guarded with `(param IS NULL OR condition)`.
  // That pattern reads tidily and costs enormously: measured at 100k, the
  // guarded form of this exact query took 155.2 s against 8.2 s composed —
  // 18.8x, for identical results. Postgres cannot use the null-guarded
  // predicates to restrict the scan, so the anti-join is re-evaluated far more
  // often than it needs to be.
  const conditions: Prisma.Sql[] = [
    Prisma.sql`o."storeId" = ${storeId}`,
    Prisma.sql`oi."productId" IN (${Prisma.join(productIds)})`,
  ];
  if (options.orderedAfter) {
    conditions.push(Prisma.sql`o."createdAt" >= ${options.orderedAfter}`);
  }
  if (options.orderedBefore) {
    conditions.push(Prisma.sql`o."createdAt" <= ${options.orderedBefore}`);
  }
  if (options.excludeProductId) {
    conditions.push(Prisma.sql`
      NOT EXISTS (
        SELECT 1
        FROM "order_items" oi2
        JOIN "orders" o2 ON o2."id" = oi2."orderId"
        WHERE o2."customerId" = o."customerId"
          AND o2."storeId" = ${storeId}
          AND oi2."productId" = ${options.excludeProductId}
      )`);
  }

  let cursor = "";
  for (;;) {
    const page = await prisma.$queryRaw<Array<{ customerId: string }>>`
      SELECT DISTINCT o."customerId"
      FROM "order_items" oi
      JOIN "orders" o ON o."id" = oi."orderId"
      WHERE ${Prisma.join(conditions, " AND ")}
        AND o."customerId" > ${cursor}
      ORDER BY o."customerId" ASC
      LIMIT 2000
    `;
    if (page.length === 0) break;
    for (const row of page) digest.add(row.customerId);
    cursor = page[page.length - 1]!.customerId;
    if (page.length < 2_000) break;
  }
  return { digest, count: digest.count };
}

async function scanRepurchaseWindows(
  storeId: string,
  results: CampaignOpportunity[]
): Promise<void> {
  const cycles = await prisma.productRepurchaseCycle.findMany({
    where: { storeId, confidence: { gt: 0.3 }, sampleSize: { gte: 3 } },
    select: { productId: true, medianDays: true },
  });

  if (cycles.length === 0) return;

  const now = new Date();
  const windowDays = 7; // look for customers within 7 days of repurchase window

  for (const cycle of cycles) {
    const windowStart = new Date(now.getTime() - (cycle.medianDays + windowDays) * 86400000);
    const windowEnd = new Date(now.getTime() - (cycle.medianDays - windowDays) * 86400000);

    const base = { storeId, type: "repurchase_window" as const };
    const { digest, count } = await streamProductBuyers(storeId, [cycle.productId], base, {
      orderedAfter: windowStart,
      orderedBefore: windowEnd,
    });
    if (count < 2) continue;

    const estimate = await estimateRevenue(storeId, count, "repurchase_window");

    const opportunity: CampaignOpportunity = {
      type: "repurchase_window",
      storeId,
      customerCount: count,
      productIds: [cycle.productId],
      reasoning: `${count} customers are within the repurchase window for a product (median ${Math.round(cycle.medianDays)} day cycle).`,
      urgency: 70,
      estimatedRevenue: estimate,
    };
    opportunity.audienceFingerprint = digest.finish(opportunity);
    results.push(opportunity);
  }
}

async function scanNewArrivals(storeId: string, results: CampaignOpportunity[]): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

  const newProducts = await prisma.product.findMany({
    where: {
      storeId,
      status: "active",
      externalCreatedAt: { gte: sevenDaysAgo },
    },
    select: { id: true, title: true },
  });

  if (newProducts.length === 0) return;

  // Count active marketing customers
  const customerCount = await prisma.customer.count({
    where: { storeId, acceptsMarketing: true },
  });

  const estimate = await estimateRevenue(storeId, customerCount, "new_arrival");

  results.push({
    type: "new_arrival",
    storeId,
    customerCount,
    productIds: newProducts.map((p) => p.id),
    reasoning: `${newProducts.length} new product(s) added in last 7 days. Announce to ${customerCount} subscribers.`,
    urgency: 50,
    estimatedRevenue: estimate,
    metadata: { productTitles: newProducts.map((p) => p.title) },
  });
}

async function scanReEngagement(storeId: string, results: CampaignOpportunity[]): Promise<void> {
  const base = { storeId, type: "re_engagement" as const };
  const { digest, count } = await streamCustomerStateAudience(
    { storeId, lifecycleStage: { in: ["lost", "inactive"] } },
    base
  );

  if (count < 5) return;

  const estimate = await estimateRevenue(storeId, count, "re_engagement");

  const opportunity: CampaignOpportunity = {
    type: "re_engagement",
    storeId,
    segmentName: "Lost/Inactive",
    customerCount: count,
    reasoning: `${count} customers have gone inactive. Re-engagement campaign with incentive recommended.`,
    urgency: 40,
    estimatedRevenue: estimate,
  };
  opportunity.audienceFingerprint = digest.finish(opportunity);
  results.push(opportunity);
}

async function scanVipMilestones(storeId: string, results: CampaignOpportunity[]): Promise<void> {
  const base = { storeId, type: "vip_milestone" as const };
  const { digest, count } = await streamCustomerStateAudience(
    { storeId, vipLevel: { in: ["gold", "platinum"] } },
    base
  );

  if (count === 0) return;
  const estimate = await estimateRevenue(storeId, count, "vip_milestone");

  const opportunity: CampaignOpportunity = {
    type: "vip_milestone",
    storeId,
    segmentName: "VIP",
    customerCount: count,
    reasoning: `${count} VIP customers eligible for milestone recognition and exclusive offers.`,
    urgency: 35,
    estimatedRevenue: estimate,
  };
  opportunity.audienceFingerprint = digest.finish(opportunity);
  results.push(opportunity);
}

async function scanLowStock(storeId: string, results: CampaignOpportunity[]): Promise<void> {
  // Find products with <10 stock that have been previously purchased
  const lowStockProducts = await prisma.product.findMany({
    where: {
      storeId,
      status: "active",
      variants: { some: { inventory: { lt: 10, gt: 0 } } },
    },
    select: { id: true, title: true },
    take: 10,
  });

  if (lowStockProducts.length === 0) return;

  const productIds = lowStockProducts.map((p) => p.id);

  // Find customers who previously bought these products
  const base = { storeId, type: "low_stock" as const };
  const { digest, count } = await streamProductBuyers(storeId, productIds, base);
  if (count < 2) return;

  const estimate = await estimateRevenue(storeId, count, "low_stock");

  const opportunity: CampaignOpportunity = {
    type: "low_stock",
    storeId,
    segmentName: "Low Stock Interest",
    customerCount: count,
    productIds,
    reasoning: `${lowStockProducts.length} product(s) running low on stock. ${count} past buyers may want to grab them before they're gone.`,
    urgency: 75,
    estimatedRevenue: estimate,
    metadata: { productTitles: lowStockProducts.map((p) => p.title) },
  };
  opportunity.audienceFingerprint = digest.finish(opportunity);
  results.push(opportunity);
}

async function scanSeasonal(storeId: string, results: CampaignOpportunity[]): Promise<void> {
  const upcoming = getUpcomingEvents(21); // look 3 weeks ahead
  if (upcoming.length === 0) return;

  const event = upcoming[0]!; // closest event
  const daysUntil = Math.ceil((event.date.getTime() - Date.now()) / 86400000);

  const customerCount = await prisma.customer.count({
    where: { storeId, acceptsMarketing: true },
  });

  if (customerCount < 5) return;

  const estimate = await estimateRevenue(storeId, customerCount, "seasonal");

  results.push({
    type: "seasonal",
    storeId,
    segmentName: "All Subscribers",
    customerCount,
    reasoning: `${event.name} is ${daysUntil} days away. Seasonal campaign to ${customerCount} subscribers recommended.`,
    urgency: Math.min(80, 40 + Math.max(0, 21 - daysUntil) * 3),
    estimatedRevenue: estimate,
    metadata: { eventName: event.name, eventDate: event.date.toISOString(), daysUntil },
  });
}

async function scanCrossSell(storeId: string, results: CampaignOpportunity[]): Promise<void> {
  // Find product co-occurrence: products frequently bought together
  const recentOrders = await prisma.order.findMany({
    where: { storeId, createdAt: { gte: new Date(Date.now() - 90 * 86400000) } },
    select: {
      customerId: true,
      items: { select: { productId: true } },
    },
    take: 500,
  });

  // Build co-occurrence map: productA → productB → count
  const coOccurrence = new Map<string, Map<string, number>>();
  for (const order of recentOrders) {
    const pids = order.items.map((i) => i.productId);
    for (let a = 0; a < pids.length; a++) {
      for (let b = a + 1; b < pids.length; b++) {
        const key = pids[a]!;
        const val = pids[b]!;
        if (!coOccurrence.has(key)) coOccurrence.set(key, new Map());
        const inner = coOccurrence.get(key)!;
        inner.set(val, (inner.get(val) ?? 0) + 1);
      }
    }
  }

  // Find the strongest pair
  let bestPair: { productA: string; productB: string; count: number } | null = null;
  for (const [a, partners] of coOccurrence) {
    for (const [b, count] of partners) {
      if (count >= 3 && (!bestPair || count > bestPair.count)) {
        bestPair = { productA: a, productB: b, count };
      }
    }
  }

  if (!bestPair) return;

  // Find customers who bought A but not B
  // Bought A and never bought B, as an anti-join. This was two store-wide
  // arrays and a Set difference held in process.
  const base = { storeId, type: "cross_sell" as const };
  const { digest, count } = await streamProductBuyers(storeId, [bestPair.productA], base, {
    excludeProductId: bestPair.productB,
  });

  if (count < 3) return;

  const estimate = await estimateRevenue(storeId, count, "cross_sell");

  const opportunity: CampaignOpportunity = {
    type: "cross_sell",
    storeId,
    segmentName: "Cross-Sell",
    customerCount: count,
    productIds: [bestPair.productB],
    reasoning: `${count} customers bought a commonly paired product but not its complement. Cross-sell opportunity detected (${bestPair.count} co-purchases observed).`,
    urgency: 45,
    estimatedRevenue: estimate,
  };
  opportunity.audienceFingerprint = digest.finish(opportunity);
  results.push(opportunity);
}
