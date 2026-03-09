import { prisma } from "@allohq/database";
import type { ProductScore } from "../types";

/**
 * Build product co-purchase affinity matrix from order history.
 * Persists pairs to ProductAffinityPair table for fast lookups.
 */
export async function buildAffinityMatrix(storeId: string): Promise<number> {
  const twelveMonthsAgo = new Date(Date.now() - 365 * 86400000);

  // Fetch all orders with their items from the last 12 months
  const orders = await prisma.order.findMany({
    where: { storeId, createdAt: { gte: twelveMonthsAgo } },
    select: {
      items: { select: { productId: true } },
    },
  });

  // Build co-occurrence map: productA → productB → count
  const coOccurrence = new Map<string, Map<string, number>>();
  const productPurchaseCounts = new Map<string, number>();

  for (const order of orders) {
    const pids = [...new Set(order.items.map((i) => i.productId))];

    // Count individual product purchases
    for (const pid of pids) {
      productPurchaseCounts.set(pid, (productPurchaseCounts.get(pid) ?? 0) + 1);
    }

    // Count co-occurrences (both directions)
    for (let a = 0; a < pids.length; a++) {
      for (let b = a + 1; b < pids.length; b++) {
        const keyA = pids[a]!;
        const keyB = pids[b]!;

        // Store in canonical order (A < B) to avoid duplicates
        const [first, second] = keyA < keyB ? [keyA, keyB] : [keyB, keyA];

        if (!coOccurrence.has(first)) coOccurrence.set(first, new Map());
        const inner = coOccurrence.get(first)!;
        inner.set(second, (inner.get(second) ?? 0) + 1);
      }
    }
  }

  // Upsert to database
  let pairCount = 0;
  for (const [productA, partners] of coOccurrence) {
    for (const [productB, coCount] of partners) {
      if (coCount < 2) continue; // Skip weak pairs

      const purchasesA = productPurchaseCounts.get(productA) ?? 1;
      const purchasesB = productPurchaseCounts.get(productB) ?? 1;
      const confidence = coCount / Math.max(purchasesA, purchasesB);

      await prisma.productAffinityPair.upsert({
        where: {
          storeId_productA_productB: { storeId, productA, productB },
        },
        create: { storeId, productA, productB, coCount, confidence },
        update: { coCount, confidence },
      });
      pairCount++;
    }
  }

  console.log(`[affinity-matrix] Built ${pairCount} affinity pairs for store ${storeId}`);
  return pairCount;
}

/**
 * Get affinity-based recommendations for given products.
 * Returns products frequently bought together with the input products.
 */
export async function getAffinityRecommendations(
  storeId: string,
  productIds: string[],
  limit: number,
): Promise<ProductScore[]> {
  if (productIds.length === 0) return [];

  // Query pairs where any of our products appear as productA or productB
  const pairs = await prisma.productAffinityPair.findMany({
    where: {
      storeId,
      OR: [
        { productA: { in: productIds } },
        { productB: { in: productIds } },
      ],
    },
    orderBy: { confidence: "desc" },
    take: limit * 3, // Fetch extra to filter
  });

  // Collect recommended products (excluding input products)
  const inputSet = new Set(productIds);
  const scoreMap = new Map<string, { score: number; coCount: number }>();

  for (const pair of pairs) {
    const recommendedId = inputSet.has(pair.productA) ? pair.productB : pair.productA;
    if (inputSet.has(recommendedId)) continue;

    const existing = scoreMap.get(recommendedId);
    if (!existing || pair.confidence > existing.score) {
      scoreMap.set(recommendedId, { score: pair.confidence, coCount: pair.coCount });
    }
  }

  // Sort by score and take top N
  const sorted = [...scoreMap.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit);

  return sorted.map(([productId, data]) => ({
    productId,
    score: data.score,
    strategy: "affinity" as const,
    reason: `Frequently bought together (${data.coCount} co-purchases)`,
  }));
}
