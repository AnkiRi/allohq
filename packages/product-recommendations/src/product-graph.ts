import { prisma } from "@allohq/database";

export type RelationshipType = "cross_sell" | "upsell" | "replenishment" | "bundle" | "substitute";

type Candidate = {
  sourceProductId: string;
  targetProductId: string;
  relationshipType: RelationshipType;
  evidenceSource: string;
  supportCount: number;
  confidence: number;
  medianLagDays?: number;
  explanation: string;
};

const median = (values: number[]) => {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/** Pure learner used by the worker and tests. It deliberately uses counts and
 * timestamps only; no per-customer LLM work is involved. */
export function learnProductRelationships(
  orders: Array<{ customerId: string; createdAt: Date; items: Array<{ productId: string }> }>
): Candidate[] {
  const basket = new Map<string, number>();
  const sequences = new Map<string, number[]>();
  const replenishment = new Map<string, number[]>();
  const byCustomer = new Map<string, typeof orders>();
  for (const order of orders) {
    const ids = [...new Set(order.items.map((item) => item.productId))];
    for (let a = 0; a < ids.length; a++)
      for (let b = a + 1; b < ids.length; b++) {
        for (const [source, target] of [
          [ids[a]!, ids[b]!],
          [ids[b]!, ids[a]!],
        ]) {
          const key = `${source}|${target}`;
          basket.set(key, (basket.get(key) ?? 0) + 1);
        }
      }
    const list = byCustomer.get(order.customerId) ?? [];
    list.push(order);
    byCustomer.set(order.customerId, list);
  }
  for (const customerOrders of byCustomer.values()) {
    customerOrders.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const lastSeen = new Map<string, Date>();
    for (let i = 0; i < customerOrders.length; i++) {
      const current = customerOrders[i]!;
      const currentIds = [...new Set(current.items.map((item) => item.productId))];
      for (const id of currentIds) {
        const previous = lastSeen.get(id);
        if (previous) {
          const key = `${id}|${id}`;
          const days = (current.createdAt.getTime() - previous.getTime()) / 86400000;
          if (days > 0 && days <= 365)
            (replenishment.get(key) ?? replenishment.set(key, []).get(key)!).push(days);
        }
        lastSeen.set(id, current.createdAt);
      }
      for (let j = Math.max(0, i - 3); j < i; j++) {
        const previous = customerOrders[j]!;
        const days = (current.createdAt.getTime() - previous.createdAt.getTime()) / 86400000;
        if (days <= 0 || days > 180) continue;
        const previousIds = [...new Set(previous.items.map((item) => item.productId))];
        for (const source of previousIds)
          for (const target of currentIds)
            if (source !== target) {
              const key = `${source}|${target}`;
              const values = sequences.get(key) ?? [];
              values.push(days);
              sequences.set(key, values);
            }
      }
    }
  }
  const out: Candidate[] = [];
  for (const [key, count] of basket)
    if (count >= 2) {
      const [sourceProductId, targetProductId] = key.split("|") as [string, string];
      out.push({
        sourceProductId,
        targetProductId,
        relationshipType: "bundle",
        evidenceSource: "same_basket",
        supportCount: count,
        confidence: Math.min(0.95, count / 10),
        explanation: `Bought together in ${count} orders.`,
      });
    }
  for (const [key, lags] of sequences)
    if (lags.length >= 2) {
      const [sourceProductId, targetProductId] = key.split("|") as [string, string];
      const lag = median(lags);
      out.push({
        sourceProductId,
        targetProductId,
        relationshipType: "cross_sell",
        evidenceSource: "order_sequence",
        supportCount: lags.length,
        confidence: Math.min(0.95, lags.length / 10),
        medianLagDays: lag,
        explanation: `${lags.length} customers bought this next, typically after ${Math.round(lag ?? 0)} days.`,
      });
    }
  for (const [key, lags] of replenishment)
    if (lags.length >= 2) {
      const [productId] = key.split("|");
      const lag = median(lags);
      out.push({
        sourceProductId: productId!,
        targetProductId: productId!,
        relationshipType: "replenishment",
        evidenceSource: "reorder",
        supportCount: lags.length,
        confidence: Math.min(0.95, lags.length / 8),
        medianLagDays: lag,
        explanation: `${lags.length} repeat purchases, typically every ${Math.round(lag ?? 0)} days.`,
      });
    }
  return out;
}

export async function buildProductGraph(storeId: string): Promise<number> {
  const since = new Date(Date.now() - 365 * 86400000);
  const [orders, products] = await Promise.all([
    prisma.order.findMany({
      where: { storeId, status: { not: "cancelled" }, createdAt: { gte: since } },
      select: { customerId: true, createdAt: true, items: { select: { productId: true } } },
    }),
    prisma.product.findMany({
      where: { storeId, status: "active" },
      select: { id: true, title: true, productType: true, price: true },
    }),
  ]);
  const candidates = learnProductRelationships(orders);
  // Catalog-derived upgrade suggestions make a new store useful immediately,
  // but remain visibly low-confidence until approved or supported by orders.
  const byType = new Map<string, typeof products>();
  for (const product of products)
    if (product.productType) {
      const list = byType.get(product.productType) ?? [];
      list.push(product);
      byType.set(product.productType, list);
    }
  for (const group of byType.values())
    for (const source of group) {
      const target = group
        .filter((p) => p.price >= source.price * 1.2)
        .sort((a, b) => a.price - b.price)[0];
      if (target)
        candidates.push({
          sourceProductId: source.id,
          targetProductId: target.id,
          relationshipType: "upsell",
          evidenceSource: "catalog",
          supportCount: 0,
          confidence: 0.2,
          explanation: `${target.title} is a higher-priced option in the same product type; review before use.`,
        });
    }
  for (const candidate of candidates) {
    const key = {
      storeId_sourceProductId_targetProductId_relationshipType: {
        storeId,
        sourceProductId: candidate.sourceProductId,
        targetProductId: candidate.targetProductId,
        relationshipType: candidate.relationshipType,
      },
    };
    const existing = await prisma.productRelationship.findUnique({ where: key });
    if (existing && (existing.status !== "suggested" || existing.pinned)) continue;
    await prisma.productRelationship.upsert({
      where: key,
      create: { storeId, ...candidate },
      update: { ...candidate, version: { increment: 1 }, evidenceUpdatedAt: new Date() },
    });
  }
  return candidates.length;
}
