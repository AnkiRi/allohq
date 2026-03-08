import { prisma } from "@allohq/database";
import type { ReorderPrediction } from "./types";

/**
 * Predict reorder timing for a customer based on their order history intervals.
 */
export async function predictReorderTiming(
  customerId: string,
  storeId: string,
): Promise<ReorderPrediction> {
  const orders = await prisma.order.findMany({
    where: { customerId, storeId, status: { not: "cancelled" } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (orders.length < 2) {
    return { expectedDays: 0, confidence: 0, nextExpectedDate: null };
  }

  // Calculate intervals between consecutive orders
  const intervals: number[] = [];
  for (let i = 1; i < orders.length; i++) {
    const curr = orders[i]!;
    const prev = orders[i - 1]!;
    const daysBetween =
      (curr.createdAt.getTime() - prev.createdAt.getTime()) /
      (1000 * 60 * 60 * 24);
    intervals.push(daysBetween);
  }

  // Sort for median calculation
  const sorted = [...intervals].sort((a, b) => a - b);
  let medianInterval: number;
  if (sorted.length % 2 === 0) {
    medianInterval = ((sorted[sorted.length / 2 - 1] ?? 0) + (sorted[sorted.length / 2] ?? 0)) / 2;
  } else {
    medianInterval = sorted[Math.floor(sorted.length / 2)] ?? 0;
  }

  // Confidence increases with more data points and lower variance
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance =
    intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
  const coeffOfVariation = mean > 0 ? Math.sqrt(variance) / mean : 1;

  // More orders and more consistent intervals = higher confidence
  const dataPointFactor = Math.min(1, intervals.length / 5);
  const consistencyFactor = Math.max(0, 1 - coeffOfVariation);
  const confidence = Math.round(dataPointFactor * 0.5 + consistencyFactor * 0.5) * 100 / 100;

  // Next expected date from last order
  const lastOrder = orders[orders.length - 1]!;
  const nextExpectedDate = new Date(
    lastOrder.createdAt.getTime() + medianInterval * 24 * 60 * 60 * 1000,
  );

  return {
    expectedDays: Math.round(medianInterval),
    confidence: Math.min(1, Math.max(0, confidence)),
    nextExpectedDate,
  };
}
