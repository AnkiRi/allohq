import { prisma } from "@allohq/database";
import type { ProductScore } from "../types";

/**
 * Cross-sell: recommend the next-best-product for a customer.
 * Combines affinity data with customer's purchase history to find
 * products most co-purchased with what they own but haven't bought.
 * Filters out owned and out-of-stock products.
 */
export async function getCrossSellRecommendations(
  storeId: string,
  customerId: string,
  limit: number,
): Promise<ProductScore[]> {
  // Get products the customer has bought
  const ownedItems = await prisma.orderItem.findMany({
    where: { order: { storeId, customerId } },
    select: { productId: true },
    distinct: ["productId"],
  });

  const ownedIds = ownedItems.map((i) => i.productId);
  if (ownedIds.length === 0) return [];
  const ownedSet = new Set(ownedIds);

  // Get affinity pairs for owned products
  const pairs = await prisma.productAffinityPair.findMany({
    where: {
      storeId,
      OR: [
        { productA: { in: ownedIds } },
        { productB: { in: ownedIds } },
      ],
      coCount: { gte: 2 },
    },
    orderBy: { confidence: "desc" },
    take: limit * 5,
  });

  // Score candidates: products co-purchased with owned products but not yet bought
  const candidateScores = new Map<string, { totalScore: number; reasons: string[] }>();

  for (const pair of pairs) {
    const candidateId = ownedSet.has(pair.productA) ? pair.productB : pair.productA;
    if (ownedSet.has(candidateId)) continue;

    const existing = candidateScores.get(candidateId) ?? { totalScore: 0, reasons: [] };
    existing.totalScore += pair.confidence;
    if (existing.reasons.length < 2) {
      existing.reasons.push(`${pair.coCount} co-purchases`);
    }
    candidateScores.set(candidateId, existing);
  }

  if (candidateScores.size === 0) return [];

  // Filter out out-of-stock products
  const candidateIds = [...candidateScores.keys()];
  const inStockProducts = await prisma.product.findMany({
    where: {
      id: { in: candidateIds },
      storeId,
      status: "active",
      variants: { some: { inventory: { gt: 0 } } },
    },
    select: { id: true },
  });
  const inStockSet = new Set(inStockProducts.map((p) => p.id));

  // Build final results
  const results: ProductScore[] = [];
  for (const [productId, data] of candidateScores) {
    if (!inStockSet.has(productId)) continue;

    results.push({
      productId,
      score: data.totalScore,
      strategy: "cross_sell",
      reason: `Complements your purchases (${data.reasons.join(", ")})`,
    });
  }

  // Normalize scores
  const maxScore = Math.max(...results.map((r) => r.score), 1);
  for (const r of results) {
    r.score = r.score / maxScore;
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
