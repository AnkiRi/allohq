import { opportunityJobId, type CampaignOpportunity } from "@allohq/campaign-engine";

type CampaignFactoryQueue = {
  add(
    name: "generate-draft",
    data: { opportunity: CampaignOpportunity },
    options: {
      jobId: string;
      removeOnComplete: { age: number };
      removeOnFail: { age: number };
    },
  ): Promise<unknown>;
};

/** The only worker entry point for turning detected opportunities into drafts. */
export async function enqueueCampaignOpportunities(
  queue: CampaignFactoryQueue,
  opportunities: CampaignOpportunity[],
): Promise<void> {
  for (const opportunity of opportunities) {
    await queue.add(
      "generate-draft",
      { opportunity },
      {
        jobId: opportunityJobId(opportunity),
        removeOnComplete: { age: 48 * 60 * 60 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    );
  }
}
