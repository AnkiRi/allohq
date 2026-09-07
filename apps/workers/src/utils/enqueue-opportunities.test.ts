import assert from "node:assert/strict";
import test from "node:test";
import { enqueueCampaignOpportunities } from "./enqueue-opportunities";

test("every opportunity producer uses deterministic queue deduplication", async () => {
  const additions: Array<{ name: string; options: { jobId: string } }> = [];
  const queue = {
    async add(name: "generate-draft", _data: unknown, options: { jobId: string }) {
      additions.push({ name, options });
    },
  };
  const opportunity = {
    type: "cross_sell" as const,
    storeId: "store-1",
    customerCount: 1,
    customerIds: ["customer-1"],
    reasoning: "Relevant complementary purchase",
    urgency: 50,
  };
  await enqueueCampaignOpportunities(queue, [opportunity, opportunity]);
  assert.equal(additions.length, 2);
  assert.equal(additions[0]?.name, "generate-draft");
  assert.equal(additions[0]?.options.jobId, additions[1]?.options.jobId);
});
