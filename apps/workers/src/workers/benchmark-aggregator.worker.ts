import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { getBenchmarkComparison } from "@allohq/campaign-engine";
import { redisConnection, QUEUE_NAMES } from "../config";

interface BenchmarkJobData {
  type: string;
}

// Minimum number of stores per category to produce a benchmark
const MIN_STORES_PER_CATEGORY = 3;

const CHANNELS = ["email", "sms", "whatsapp"] as const;

/**
 * Calculate percentiles from a sorted array of numbers.
 */
function percentiles(sorted: number[]): { p25: number; p50: number; p75: number } {
  if (sorted.length === 0) return { p25: 0, p50: 0, p75: 0 };

  const at = (p: number) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo]!;
    return sorted[lo]! * (hi - idx) + sorted[hi]! * (idx - lo);
  };

  return { p25: at(0.25), p50: at(0.5), p75: at(0.75) };
}

/**
 * Benchmark aggregator worker.
 * Runs weekly. For each store category with enough stores,
 * calculates aggregate messaging/commerce metrics and upserts
 * them into StoreBenchmark for cross-store comparison.
 */
export const benchmarkAggregatorWorker = new Worker<BenchmarkJobData>(
  QUEUE_NAMES.BENCHMARK_AGGREGATE,
  async (_job) => {
    console.log("[benchmark-aggregator] Starting weekly benchmark aggregation");

    const now = new Date();
    // Period start is one week ago (aligned to start of day UTC)
    const periodStart = new Date(now);
    periodStart.setUTCDate(periodStart.getUTCDate() - 7);
    periodStart.setUTCHours(0, 0, 0, 0);

    // Get all active stores grouped by category
    const stores = await prisma.store.findMany({
      where: { isActive: true, storeCategory: { not: null } },
      select: { id: true, storeCategory: true },
    });

    // Group stores by category
    const byCategory: Record<string, string[]> = {};
    for (const s of stores) {
      const cat = s.storeCategory!;
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat]!.push(s.id);
    }

    let totalUpserted = 0;

    for (const [category, storeIds] of Object.entries(byCategory)) {
      if (storeIds.length < MIN_STORES_PER_CATEGORY) {
        console.log(`[benchmark-aggregator] Skipping "${category}" — only ${storeIds.length} stores (need ${MIN_STORES_PER_CATEGORY})`);
        continue;
      }

      console.log(`[benchmark-aggregator] Processing "${category}" with ${storeIds.length} stores`);

      // ── Open Rate (per channel + aggregate) ──

      for (const channel of [...CHANNELS, null]) {
        const channelFilter = channel ? { channel } : {};

        // Get per-store open rates
        const storeRates: number[] = [];
        for (const sid of storeIds) {
          const sent = await prisma.messageLog.count({
            where: {
              storeId: sid,
              ...channelFilter,
              status: { in: ["sent", "delivered", "opened", "clicked"] },
              sentAt: { gte: periodStart, lte: now },
            },
          });
          if (sent === 0) continue;
          const opened = await prisma.messageLog.count({
            where: {
              storeId: sid,
              ...channelFilter,
              outcome: "opened",
              sentAt: { gte: periodStart, lte: now },
            },
          });
          storeRates.push(opened / sent);
        }

        if (storeRates.length >= MIN_STORES_PER_CATEGORY) {
          storeRates.sort((a, b) => a - b);
          const avg = storeRates.reduce((a, b) => a + b, 0) / storeRates.length;
          const pcts = percentiles(storeRates);
          await prisma.storeBenchmark.upsert({
            where: {
              category_metric_channel_period_periodStart: {
                category,
                metric: "open_rate",
                channel: channel ?? "",
                period: "weekly",
                periodStart,
              },
            },
            create: {
              category,
              metric: "open_rate",
              channel: channel ?? "",
              period: "weekly",
              periodStart,
              value: avg,
              sampleSize: storeRates.length,
              ...pcts,
            },
            update: {
              value: avg,
              sampleSize: storeRates.length,
              ...pcts,
            },
          });
          totalUpserted++;
        }
      }

      // ── Click Rate (per channel + aggregate) ──

      for (const channel of [...CHANNELS, null]) {
        const channelFilter = channel ? { channel } : {};
        const storeRates: number[] = [];
        for (const sid of storeIds) {
          const sent = await prisma.messageLog.count({
            where: {
              storeId: sid,
              ...channelFilter,
              status: { in: ["sent", "delivered", "opened", "clicked"] },
              sentAt: { gte: periodStart, lte: now },
            },
          });
          if (sent === 0) continue;
          const clicked = await prisma.messageLog.count({
            where: {
              storeId: sid,
              ...channelFilter,
              outcome: "clicked",
              sentAt: { gte: periodStart, lte: now },
            },
          });
          storeRates.push(clicked / sent);
        }

        if (storeRates.length >= MIN_STORES_PER_CATEGORY) {
          storeRates.sort((a, b) => a - b);
          const avg = storeRates.reduce((a, b) => a + b, 0) / storeRates.length;
          const pcts = percentiles(storeRates);
          await prisma.storeBenchmark.upsert({
            where: {
              category_metric_channel_period_periodStart: {
                category,
                metric: "click_rate",
                channel: channel ?? "",
                period: "weekly",
                periodStart,
              },
            },
            create: {
              category,
              metric: "click_rate",
              channel: channel ?? "",
              period: "weekly",
              periodStart,
              value: avg,
              sampleSize: storeRates.length,
              ...pcts,
            },
            update: {
              value: avg,
              sampleSize: storeRates.length,
              ...pcts,
            },
          });
          totalUpserted++;
        }
      }

      // ── Conversion Rate (orders / messages sent, aggregate only) ──

      {
        const storeRates: number[] = [];
        for (const sid of storeIds) {
          const sent = await prisma.messageLog.count({
            where: {
              storeId: sid,
              status: { in: ["sent", "delivered", "opened", "clicked"] },
              sentAt: { gte: periodStart, lte: now },
            },
          });
          if (sent === 0) continue;
          const orders = await prisma.order.count({
            where: {
              storeId: sid,
              createdAt: { gte: periodStart, lte: now },
            },
          });
          storeRates.push(orders / sent);
        }

        if (storeRates.length >= MIN_STORES_PER_CATEGORY) {
          storeRates.sort((a, b) => a - b);
          const avg = storeRates.reduce((a, b) => a + b, 0) / storeRates.length;
          const pcts = percentiles(storeRates);
          await prisma.storeBenchmark.upsert({
            where: {
              category_metric_channel_period_periodStart: {
                category,
                metric: "conversion_rate",
                channel: "",
                period: "weekly",
                periodStart,
              },
            },
            create: {
              category,
              metric: "conversion_rate",
              channel: "",
              period: "weekly",
              periodStart,
              value: avg,
              sampleSize: storeRates.length,
              ...pcts,
            },
            update: {
              value: avg,
              sampleSize: storeRates.length,
              ...pcts,
            },
          });
          totalUpserted++;
        }
      }

      // ── Churn Rate (customers moving to AT_RISK or LOST / total active) ──

      {
        const storeRates: number[] = [];
        for (const sid of storeIds) {
          const totalCustomers = await prisma.rfmScore.count({
            where: { storeId: sid },
          });
          if (totalCustomers === 0) continue;
          const churned = await prisma.rfmScore.count({
            where: {
              storeId: sid,
              segment: { in: ["At Risk", "Lost", "Hibernating", "About to Sleep"] },
            },
          });
          storeRates.push(churned / totalCustomers);
        }

        if (storeRates.length >= MIN_STORES_PER_CATEGORY) {
          storeRates.sort((a, b) => a - b);
          const avg = storeRates.reduce((a, b) => a + b, 0) / storeRates.length;
          const pcts = percentiles(storeRates);
          await prisma.storeBenchmark.upsert({
            where: {
              category_metric_channel_period_periodStart: {
                category,
                metric: "churn_rate",
                channel: "",
                period: "weekly",
                periodStart,
              },
            },
            create: {
              category,
              metric: "churn_rate",
              channel: "",
              period: "weekly",
              periodStart,
              value: avg,
              sampleSize: storeRates.length,
              ...pcts,
            },
            update: {
              value: avg,
              sampleSize: storeRates.length,
              ...pcts,
            },
          });
          totalUpserted++;
        }
      }

      // ── Average Order Value ──

      {
        const storeValues: number[] = [];
        for (const sid of storeIds) {
          const result = await prisma.order.aggregate({
            where: {
              storeId: sid,
              createdAt: { gte: periodStart, lte: now },
            },
            _avg: { totalPrice: true },
            _count: { id: true },
          });
          if (result._count.id === 0) continue;
          const aov = Number(result._avg.totalPrice ?? 0);
          if (aov > 0) storeValues.push(aov);
        }

        if (storeValues.length >= MIN_STORES_PER_CATEGORY) {
          storeValues.sort((a, b) => a - b);
          const avg = storeValues.reduce((a, b) => a + b, 0) / storeValues.length;
          const pcts = percentiles(storeValues);
          await prisma.storeBenchmark.upsert({
            where: {
              category_metric_channel_period_periodStart: {
                category,
                metric: "avg_order_value",
                channel: "",
                period: "weekly",
                periodStart,
              },
            },
            create: {
              category,
              metric: "avg_order_value",
              channel: "",
              period: "weekly",
              periodStart,
              value: avg,
              sampleSize: storeValues.length,
              ...pcts,
            },
            update: {
              value: avg,
              sampleSize: storeValues.length,
              ...pcts,
            },
          });
          totalUpserted++;
        }
      }

      // ── Reorder Rate (repeat purchasers / total purchasers) ──

      {
        const storeRates: number[] = [];
        for (const sid of storeIds) {
          const purchaserCounts = await prisma.order.groupBy({
            by: ["customerId"],
            where: {
              storeId: sid,
              createdAt: { gte: periodStart, lte: now },
              customerId: { not: "" },
            },
            _count: { id: true },
          });
          const totalPurchasers = purchaserCounts.length;
          if (totalPurchasers === 0) continue;
          const repeatPurchasers = purchaserCounts.filter((p) => (p._count as any)?.id > 1).length;
          storeRates.push(repeatPurchasers / totalPurchasers);
        }

        if (storeRates.length >= MIN_STORES_PER_CATEGORY) {
          storeRates.sort((a, b) => a - b);
          const avg = storeRates.reduce((a, b) => a + b, 0) / storeRates.length;
          const pcts = percentiles(storeRates);
          await prisma.storeBenchmark.upsert({
            where: {
              category_metric_channel_period_periodStart: {
                category,
                metric: "reorder_rate",
                channel: "",
                period: "weekly",
                periodStart,
              },
            },
            create: {
              category,
              metric: "reorder_rate",
              channel: "",
              period: "weekly",
              periodStart,
              value: avg,
              sampleSize: storeRates.length,
              ...pcts,
            },
            update: {
              value: avg,
              sampleSize: storeRates.length,
              ...pcts,
            },
          });
          totalUpserted++;
        }
      }
    }

    console.log(`[benchmark-aggregator] Done — upserted ${totalUpserted} benchmark records across ${Object.keys(byCategory).length} categories`);

    // Store per-store benchmark comparison insights in AgentMemory
    try {
      for (const storeIds of Object.values(byCategory)) {
        for (const sid of storeIds) {
          try {
            const comparison = await getBenchmarkComparison(sid);
            if (comparison && !comparison.includes("No benchmarks") && !comparison.includes("No store category")) {
              await prisma.agentMemory.upsert({
                where: {
                  id: `benchmark-${sid}`, // deterministic ID so we overwrite weekly
                },
                create: {
                  id: `benchmark-${sid}`,
                  storeId: sid,
                  memoryType: "store_pattern",
                  content: comparison,
                  importance: 0.7,
                  metadata: { source: "benchmark_aggregator", periodStart: periodStart.toISOString() },
                },
                update: {
                  content: comparison,
                  importance: 0.7,
                  metadata: { source: "benchmark_aggregator", periodStart: periodStart.toISOString() },
                },
              });
            }
          } catch (err: any) {
            console.warn(`[benchmark-aggregator] Failed to store comparison for ${sid}:`, err.message);
          }
        }
      }
    } catch (err: any) {
      console.warn("[benchmark-aggregator] Failed to store benchmark comparisons:", err.message);
    }

    return { totalUpserted, categories: Object.keys(byCategory).length };
  },
  { connection: redisConnection },
);

benchmarkAggregatorWorker.on("completed", (job) => {
  console.log(`[benchmark-aggregator] Job ${job.id} completed`);
});

benchmarkAggregatorWorker.on("failed", (job, err) => {
  console.error(`[benchmark-aggregator] Job ${job?.id} failed:`, err.message);
});
