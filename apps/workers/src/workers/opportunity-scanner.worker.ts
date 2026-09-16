import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { scanOpportunities } from "@allohq/campaign-engine";
import { logAgentActivity } from "@allohq/agent-core";
import { redisConnection, QUEUE_NAMES } from "../config";
import { ActionCategory, proposeAction } from "@allohq/autonomy-engine";

interface OpportunityScanJobData {
  storeId?: string; // If set, scan single store; otherwise scan all active stores
  type: string;
}

/**
 * Opportunity scanner worker.
 * Scheduled every 2 hours. Scans stores for actionable campaign opportunities
 * and queues each to campaign-factory.
 */
export const opportunityScannerWorker = new Worker<OpportunityScanJobData>(
  QUEUE_NAMES.OPPORTUNITY_SCAN,
  async (job) => {
    const { storeId } = job.data;

    const storeIds: string[] = [];
    if (storeId) {
      storeIds.push(storeId);
    } else {
      const stores = await prisma.store.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      storeIds.push(...stores.map((s) => s.id));
    }

    let totalOpportunities = 0;

    for (const sid of storeIds) {
      try {
        const opportunities = await scanOpportunities(sid);
        totalOpportunities += opportunities.length;

        for (const opportunity of opportunities) {
          await proposeAction(
            {
              storeId: sid,
              type: "campaign_send",
              category: opportunityCategory(opportunity.type),
              reasoning: opportunity.reasoning,
              estimatedRevenue: opportunity.estimatedRevenue?.mid,
              payload: {
                lifecycle: "decision_proposed",
                opportunity,
                campaignName: opportunityName(opportunity.type),
                targetSegment: {
                  name: opportunity.segmentName ?? opportunity.type,
                  count: opportunity.customerCount,
                },
              },
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
            },
            opportunity.urgency,
            Math.min(90, Math.max(40, opportunity.urgency))
          );
        }

        if (opportunities.length > 0) {
          await logAgentActivity(
            sid,
            `Evaluated the store and prepared **${opportunities.length}** campaign decision${opportunities.length === 1 ? "" : "s"} for review`,
            { type: "decision_proposed" }
          ).catch(() => {});
        }
      } catch (err) {
        console.error(`[opportunity-scanner] Error scanning store ${sid}:`, (err as Error).message);
      }
    }

    console.log(
      `[opportunity-scanner] Scanned ${storeIds.length} stores, found ${totalOpportunities} opportunities`
    );
    return { storesScanned: storeIds.length, totalOpportunities };
  },
  { connection: redisConnection }
);

function opportunityCategory(type: string): ActionCategory {
  if (type.includes("winback") || type.includes("re_engagement")) return ActionCategory.WIN_BACK;
  if (type.includes("repurchase")) return ActionCategory.REPURCHASE;
  if (type.includes("cross_sell")) return ActionCategory.CROSS_SELL;
  if (type.includes("vip")) return ActionCategory.VIP;
  if (type.includes("stock")) return ActionCategory.RESTOCK_ALERTS;
  return ActionCategory.PROMOTIONAL;
}

function opportunityName(type: string): string {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

opportunityScannerWorker.on("completed", (job) => {
  console.log(`[opportunity-scanner] Job ${job.id} completed`);
});

opportunityScannerWorker.on("failed", (job, err) => {
  console.error(`[opportunity-scanner] Job ${job?.id} failed:`, err.message);
});
