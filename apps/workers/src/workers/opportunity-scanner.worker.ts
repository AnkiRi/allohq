import { Worker, Queue } from "bullmq";
import { prisma } from "@allohq/database";
import { opportunityJobId, scanOpportunities } from "@allohq/campaign-engine";
import { logAgentActivity } from "@allohq/agent-core";
import { redisConnection, QUEUE_NAMES } from "../config";

const campaignFactoryQueue = new Queue(QUEUE_NAMES.CAMPAIGN_FACTORY, { connection: redisConnection });

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

        for (const opp of opportunities) {
          await campaignFactoryQueue.add("generate-draft", { opportunity: opp }, {
            jobId: opportunityJobId(opp),
            removeOnComplete: { age: 48 * 60 * 60 },
            removeOnFail: { age: 7 * 24 * 60 * 60 },
          });
        }

        if (opportunities.length > 0) {
          await logAgentActivity(sid,
            `Found **${opportunities.length}** new campaign opportunit${opportunities.length === 1 ? "y" : "ies"} — creating drafts now`,
            { type: "opportunities_found" },
          ).catch(() => {});
        }
      } catch (err) {
        console.error(`[opportunity-scanner] Error scanning store ${sid}:`, (err as Error).message);
      }
    }

    console.log(`[opportunity-scanner] Scanned ${storeIds.length} stores, found ${totalOpportunities} opportunities`);
    return { storesScanned: storeIds.length, totalOpportunities };
  },
  { connection: redisConnection },
);

opportunityScannerWorker.on("completed", (job) => {
  console.log(`[opportunity-scanner] Job ${job.id} completed`);
});

opportunityScannerWorker.on("failed", (job, err) => {
  console.error(`[opportunity-scanner] Job ${job?.id} failed:`, err.message);
});
