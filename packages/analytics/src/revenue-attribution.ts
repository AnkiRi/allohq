import { prisma } from "@allohq/database";
import type { AttributionModel, AttributionResult } from "./types";

export function attributionWeights(count: number, model: AttributionModel): number[] {
  if (count <= 0) return [];
  if (model === "first_touch") return Array.from({ length: count }, (_, index) => index === 0 ? 1 : 0);
  if (model === "last_touch") return Array.from({ length: count }, (_, index) => index === count - 1 ? 1 : 0);
  const raw = Array.from({ length: count }, (_, index) =>
    model === "linear" ? 1 : Math.pow(0.7, count - 1 - index),
  );
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map((value) => value / total);
}

/**
 * Compute multi-touch attribution for a store's orders.
 * Supports first-touch, last-touch, linear, and time-decay models.
 */
export async function computeAttribution(
  storeId: string,
  model: AttributionModel = "last_touch",
  daysBack: number = 30
): Promise<AttributionResult[]> {
  const since = new Date(Date.now() - daysBack * 86400000);

  // OrderAttribution is the durable marker that an order occurred after at
  // least one Joon message. Reconstruct the eligible touch sequence per order
  // so first/linear/time-decay are real models, not labels over last-touch rows.
  const attributions = await prisma.orderAttribution.findMany({
    where: { storeId, attributedAt: { gte: since } },
    include: {
      order: { select: { totalPrice: true, customerId: true, createdAt: true } },
    },
  });

  if (attributions.length === 0) return [];

  // Group by source
  const sourceMap = new Map<string, {
    sourceType: "campaign" | "automation";
    sourceId: string;
    channel: string;
    revenues: number[];
    orderCount: number;
  }>();

  for (const attr of attributions) {
    const windowStart = new Date(attr.order.createdAt.getTime() - attr.windowDays * 86_400_000);
    const touches = await prisma.messageLog.findMany({
      where: {
        storeId,
        customerId: attr.order.customerId,
        sentAt: { gte: windowStart, lte: attr.order.createdAt },
        status: { in: ["sent", "delivered", "opened", "clicked"] },
        OR: [{ campaignId: { not: null } }, { automationId: { not: null } }],
      },
      orderBy: { sentAt: "asc" },
      select: { campaignId: true, automationId: true, channel: true },
    });
    if (touches.length === 0) continue;

    const weights = attributionWeights(touches.length, model);
    const selected = touches
      .map((touch, index) => ({ touch, weight: weights[index] ?? 0 }))
      .filter((item) => item.weight > 0);
    const creditedSources = new Set<string>();
    for (const { touch, weight } of selected) {
      const sourceId = touch.campaignId ?? touch.automationId;
      if (!sourceId) continue;
      const sourceType = touch.campaignId ? "campaign" : "automation";
      const key = `${sourceType}:${sourceId}`;
      const credit = attr.order.totalPrice * weight;
      const existing = sourceMap.get(key);
      if (existing) {
        existing.revenues.push(credit);
        if (!creditedSources.has(key)) existing.orderCount++;
      } else {
        sourceMap.set(key, {
          sourceType,
          sourceId,
          channel: touch.channel,
          revenues: [credit],
          orderCount: 1,
        });
      }
      creditedSources.add(key);
    }
  }

  const results: AttributionResult[] = [];
  for (const [, source] of sourceMap) {
    const revenue = source.revenues.reduce((sum, value) => sum + value, 0);

    // Look up source name
    let sourceName = source.sourceId;
    if (source.sourceType === "campaign" && source.sourceId !== "direct") {
      const campaign = await prisma.campaign.findUnique({
        where: { id: source.sourceId },
        select: { name: true },
      });
      sourceName = campaign?.name ?? source.sourceId;
    } else if (source.sourceType === "automation" && source.sourceId !== "direct") {
      const automation = await prisma.automation.findUnique({
        where: { id: source.sourceId },
        select: { name: true },
      });
      sourceName = automation?.name ?? source.sourceId;
    }

    results.push({
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceName,
      channel: source.channel,
      revenue: Math.round(revenue * 100) / 100,
      orderCount: source.orderCount,
      attributionModel: model,
    });
  }

  return results.sort((a, b) => b.revenue - a.revenue);
}

/**
 * Get attribution summary by model for comparison.
 */
export async function compareAttributionModels(
  storeId: string,
  daysBack: number = 30
): Promise<Record<AttributionModel, { totalRevenue: number; topSource: string }>> {
  const models: AttributionModel[] = ["first_touch", "last_touch", "linear", "time_decay"];
  const result = {} as Record<AttributionModel, { totalRevenue: number; topSource: string }>;

  for (const model of models) {
    const attribution = await computeAttribution(storeId, model, daysBack);
    const totalRevenue = attribution.reduce((s, a) => s + a.revenue, 0);
    const topSource = attribution[0]?.sourceName ?? "none";
    result[model] = { totalRevenue: Math.round(totalRevenue * 100) / 100, topSource };
  }

  return result;
}
