/**
 * Benchmark Comparison
 *
 * Compares a store's actual metrics against its category benchmarks
 * and returns a human-readable comparison string for briefings.
 */

import { prisma } from "@allohq/database";

export async function getBenchmarkComparison(storeId: string): Promise<string> {
  // Get store category
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { storeCategory: true, storeName: true },
  });

  if (!store?.storeCategory) {
    return "No store category set — cannot compare against benchmarks yet.";
  }

  const category = store.storeCategory;

  // Get latest benchmarks for this category
  const benchmarks = await prisma.storeBenchmark.findMany({
    where: { category, period: "weekly" },
    orderBy: { periodStart: "desc" },
    take: 10, // Get latest set of metrics
  });

  if (benchmarks.length === 0) {
    return `No benchmarks available for the "${category}" category yet. Need at least 3 stores in this category.`;
  }

  // Get the most recent period
  const latestPeriodStart = benchmarks[0]!.periodStart;
  const latestBenchmarks = benchmarks.filter(
    (b) => b.periodStart.getTime() === latestPeriodStart.getTime(),
  );

  // Compute the store's own metrics for the same period
  const periodEnd = new Date(latestPeriodStart);
  periodEnd.setUTCDate(periodEnd.getUTCDate() + 7);

  const storeSent = await prisma.messageLog.count({
    where: {
      storeId,
      status: { in: ["sent", "delivered", "opened", "clicked"] },
      sentAt: { gte: latestPeriodStart, lte: periodEnd },
    },
  });

  if (storeSent === 0) {
    return `No messages sent in the latest benchmark period. Send some campaigns to see how you compare to other ${category} stores.`;
  }

  const storeOpened = await prisma.messageLog.count({
    where: {
      storeId,
      outcome: "opened",
      sentAt: { gte: latestPeriodStart, lte: periodEnd },
    },
  });

  const storeClicked = await prisma.messageLog.count({
    where: {
      storeId,
      outcome: "clicked",
      sentAt: { gte: latestPeriodStart, lte: periodEnd },
    },
  });

  const storeOrders = await prisma.order.count({
    where: {
      storeId,
      createdAt: { gte: latestPeriodStart, lte: periodEnd },
    },
  });

  const storeOpenRate = storeSent > 0 ? storeOpened / storeSent : 0;
  const storeClickRate = storeSent > 0 ? storeClicked / storeSent : 0;
  const storeConversionRate = storeSent > 0 ? storeOrders / storeSent : 0;

  // Build comparison
  const parts: string[] = [
    `Benchmark comparison for ${store.storeName ?? storeId} vs ${category} category:`,
  ];

  for (const benchmark of latestBenchmarks) {
    if (benchmark.metric === "open_rate" && benchmark.channel === "") {
      const diff = storeOpenRate - benchmark.value;
      void ((diff / Math.max(benchmark.value, 0.001)) * 100).toFixed(0);
      const direction = diff >= 0 ? "above" : "below";
      const percentile = getPercentileLabel(storeOpenRate, benchmark);
      parts.push(
        `Open rate: ${(storeOpenRate * 100).toFixed(1)}% (${direction} avg ${(benchmark.value * 100).toFixed(1)}%, ${percentile})`,
      );
    }

    if (benchmark.metric === "click_rate" && benchmark.channel === "") {
      const diff = storeClickRate - benchmark.value;
      const direction = diff >= 0 ? "above" : "below";
      const percentile = getPercentileLabel(storeClickRate, benchmark);
      parts.push(
        `Click rate: ${(storeClickRate * 100).toFixed(1)}% (${direction} avg ${(benchmark.value * 100).toFixed(1)}%, ${percentile})`,
      );
    }

    if (benchmark.metric === "conversion_rate" && benchmark.channel === "") {
      const diff = storeConversionRate - benchmark.value;
      const direction = diff >= 0 ? "above" : "below";
      const percentile = getPercentileLabel(storeConversionRate, benchmark);
      parts.push(
        `Conversion rate: ${(storeConversionRate * 100).toFixed(1)}% (${direction} avg ${(benchmark.value * 100).toFixed(1)}%, ${percentile})`,
      );
    }

    if (benchmark.metric === "churn_rate" && benchmark.channel === "") {
      parts.push(
        `Category avg churn: ${(benchmark.value * 100).toFixed(1)}%`,
      );
    }
  }

  if (parts.length === 1) {
    parts.push("Benchmark data available but no matching metrics found for comparison.");
  }

  return parts.join("\n");
}

function getPercentileLabel(
  value: number,
  benchmark: { p25?: number | null; p50?: number | null; p75?: number | null },
): string {
  const p75 = benchmark.p75 ?? Infinity;
  const p50 = benchmark.p50 ?? Infinity;
  const p25 = benchmark.p25 ?? -Infinity;

  if (value >= p75) return "top 25%";
  if (value >= p50) return "above median";
  if (value >= p25) return "below median";
  return "bottom 25%";
}
