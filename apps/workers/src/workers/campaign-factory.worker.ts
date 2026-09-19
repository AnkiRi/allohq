import { Worker } from "bullmq";
import { prepareCampaignDecision } from "@allohq/campaign-engine";
import type { CampaignOpportunity } from "@allohq/campaign-engine";
import { logAgentActivity } from "@allohq/agent-core";
import { redisConnection, QUEUE_NAMES } from "../config";

interface CampaignFactoryJobData {
  opportunity: CampaignOpportunity;
}

/**
 * Campaign factory worker.
 * Persists a decision for review. Creative generation intentionally happens
 * only after approval, so repeated scans do not spend model tokens.
 */
export const campaignFactoryWorker = new Worker<CampaignFactoryJobData>(
  QUEUE_NAMES.CAMPAIGN_FACTORY,
  async (job) => {
    const { opportunity } = job.data;
    console.log(`[campaign-factory] Preparing decision for ${opportunity.type} (store ${opportunity.storeId})`);

    const result = await prepareCampaignDecision(opportunity);

    console.log(`[campaign-factory] Decision ${result.id} prepared for ${opportunity.customerCount} customers`);

    // A rescan refreshes lastEvaluatedAt on the durable decision. It should not
    // create another chat notification for the same material opportunity.
    if (result.created) {
      await logAgentActivity(opportunity.storeId,
        `Prepared a **${opportunity.type.replaceAll("_", " ")}** decision for ${opportunity.customerCount} customers — awaiting your review`,
        { type: "decision_proposed", entityType: "action", entityId: result.id },
      ).catch(() => {});
    }

    return { actionId: result.id, targetCount: opportunity.customerCount, status: result.status };
  },
  { connection: redisConnection },
);

campaignFactoryWorker.on("completed", (job) => {
  console.log(`[campaign-factory] Job ${job.id} completed`);
});

campaignFactoryWorker.on("failed", (job, err) => {
  console.error(`[campaign-factory] Job ${job?.id} failed:`, err.message);
});
