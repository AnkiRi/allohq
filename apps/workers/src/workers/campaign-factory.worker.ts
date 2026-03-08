import { Worker } from "bullmq";
import { generateCampaignDraft } from "@allohq/campaign-engine";
import type { CampaignOpportunity } from "@allohq/campaign-engine";
import { redisConnection, QUEUE_NAMES } from "../config";

interface CampaignFactoryJobData {
  opportunity: CampaignOpportunity;
}

/**
 * Campaign factory worker.
 * On-demand: generates a campaign draft from a detected opportunity.
 * Routes through autonomy engine for approval.
 */
export const campaignFactoryWorker = new Worker<CampaignFactoryJobData>(
  QUEUE_NAMES.CAMPAIGN_FACTORY,
  async (job) => {
    const { opportunity } = job.data;
    console.log(`[campaign-factory] Generating draft for ${opportunity.type} (store ${opportunity.storeId})`);

    const draft = await generateCampaignDraft(opportunity);

    console.log(`[campaign-factory] Draft created: "${draft.name}" targeting ${draft.targetCount} customers`);
    return { draftName: draft.name, targetCount: draft.targetCount, confidence: draft.confidenceScore };
  },
  { connection: redisConnection },
);

campaignFactoryWorker.on("completed", (job) => {
  console.log(`[campaign-factory] Job ${job.id} completed`);
});

campaignFactoryWorker.on("failed", (job, err) => {
  console.error(`[campaign-factory] Job ${job?.id} failed:`, err.message);
});
