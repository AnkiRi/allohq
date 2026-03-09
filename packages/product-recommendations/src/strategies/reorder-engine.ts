import { prisma } from "@allohq/database";
import type { ProductScore } from "../types";

/**
 * Reorder engine: recommend products a customer is due to repurchase
 * based on ProductRepurchaseCycle timing data.
 */
export async function getReorderRecommendations(
  storeId: string,
  customerId: string,
  limit: number,
): Promise<ProductScore[]> {
  // Get all repurchase cycles for this store with sufficient data
  const cycles = await prisma.productRepurchaseCycle.findMany({
    where: { storeId, confidence: { gt: 0.3 }, sampleSize: { gte: 3 } },
    select: { productId: true, medianDays: true, confidence: true },
  });

  if (cycles.length === 0) return [];

  const cycleMap = new Map(cycles.map((c) => [c.productId, c]));
  const productIds = cycles.map((c) => c.productId);

  // Get customer's last purchase date for each product with a cycle
  const customerItems = await prisma.orderItem.findMany({
    where: {
      productId: { in: productIds },
      order: { storeId, customerId },
    },
    select: {
      productId: true,
      order: { select: { createdAt: true } },
    },
    orderBy: { order: { createdAt: "desc" } },
  });

  // Find most recent purchase per product
  const lastPurchase = new Map<string, Date>();
  for (const item of customerItems) {
    if (!lastPurchase.has(item.productId)) {
      lastPurchase.set(item.productId, item.order.createdAt);
    }
  }

  if (lastPurchase.size === 0) return [];

  const now = Date.now();
  const results: ProductScore[] = [];

  for (const [productId, purchaseDate] of lastPurchase) {
    const cycle = cycleMap.get(productId);
    if (!cycle) continue;

    const daysSincePurchase = (now - purchaseDate.getTime()) / 86400000;
    const ratio = daysSincePurchase / cycle.medianDays;

    // Score based on how close to repurchase window (peak at ratio=1.0)
    // Higher score when customer is within or past the window
    let score: number;
    if (ratio < 0.5) {
      score = 0; // Too early
    } else if (ratio < 0.8) {
      score = (ratio - 0.5) / 0.3 * 0.5; // Approaching
    } else if (ratio <= 1.3) {
      score = 0.5 + (1 - Math.abs(ratio - 1)) * 0.5; // In window (peak at 1.0)
    } else {
      score = Math.max(0.3, 1 - (ratio - 1.3) * 0.2); // Past window, gradually decay
    }

    // Weight by cycle confidence
    score *= cycle.confidence;

    if (score > 0.1) {
      const daysUntil = Math.round(cycle.medianDays - daysSincePurchase);
      results.push({
        productId,
        score,
        strategy: "reorder",
        reason: daysUntil <= 0
          ? `Due for reorder (${Math.abs(daysUntil)} days past cycle)`
          : `Reorder in ~${daysUntil} days (${Math.round(cycle.medianDays)}-day cycle)`,
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
