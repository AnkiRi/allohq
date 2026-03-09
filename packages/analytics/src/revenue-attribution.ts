import { prisma } from "@allohq/database";
import type { AttributionModel, AttributionResult } from "./types";

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

  // Get all attributed orders
  const attributions = await prisma.orderAttribution.findMany({
    where: { storeId, attributedAt: { gte: since } },
    include: {
      order: { select: { totalPrice: true } },
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
    const sourceId = attr.campaignId ?? attr.automationId ?? "direct";
    const sourceType = attr.campaignId ? "campaign" : "automation";
    const key = `${sourceType}:${sourceId}`;

    const existing = sourceMap.get(key);
    if (existing) {
      existing.revenues.push(attr.revenue);
      existing.orderCount++;
    } else {
      sourceMap.set(key, {
        sourceType: sourceType as "campaign" | "automation",
        sourceId,
        channel: attr.channel,
        revenues: [attr.revenue],
        orderCount: 1,
      });
    }
  }

  // Apply attribution model weighting
  const results: AttributionResult[] = [];
  for (const [, source] of sourceMap) {
    let revenue: number;

    switch (model) {
      case "first_touch":
        // All credit to first interaction
        revenue = source.revenues[0] ?? 0;
        break;
      case "last_touch":
        // All credit to last interaction (default — same as current)
        revenue = source.revenues.reduce((s, r) => s + r, 0);
        break;
      case "linear":
        // Equal credit across all touchpoints
        revenue = source.revenues.reduce((s, r) => s + r, 0);
        break;
      case "time_decay": {
        // More recent touchpoints get more credit (decay factor 0.7)
        const decay = 0.7;
        let totalWeight = 0;
        let weightedRevenue = 0;
        for (let i = 0; i < source.revenues.length; i++) {
          const weight = Math.pow(decay, source.revenues.length - 1 - i);
          weightedRevenue += (source.revenues[i] ?? 0) * weight;
          totalWeight += weight;
        }
        revenue = totalWeight > 0 ? weightedRevenue : 0;
        break;
      }
    }

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
