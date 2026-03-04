import { Worker, type Job } from "bullmq";
import { redisConnection, QUEUE_NAMES } from "../config";
import { embedProducts, embedBrandKnowledge } from "@allohq/agent-brain";

interface EmbeddingJobData {
  type: "products" | "brand" | "all";
  storeId: string;
  workspaceId?: string;
}

async function processEmbeddingJob(job: Job<EmbeddingJobData>) {
  const { type, storeId, workspaceId } = job.data;
  console.log(`[embedding] Processing ${type} for store ${storeId}`);

  let count = 0;

  switch (type) {
    case "products": {
      count = await embedProducts(storeId);
      console.log(`[embedding] Embedded ${count} products for store ${storeId}`);
      break;
    }
    case "brand": {
      if (!workspaceId) {
        throw new Error("workspaceId required for brand embedding");
      }
      count = await embedBrandKnowledge(storeId, workspaceId);
      console.log(`[embedding] Embedded ${count} brand chunks for store ${storeId}`);
      break;
    }
    case "all": {
      if (!workspaceId) {
        throw new Error("workspaceId required for full embedding");
      }
      const productCount = await embedProducts(storeId);
      const brandCount = await embedBrandKnowledge(storeId, workspaceId);
      count = productCount + brandCount;
      console.log(
        `[embedding] Embedded ${productCount} products + ${brandCount} brand chunks for store ${storeId}`
      );
      break;
    }
  }

  return { type, storeId, embeddedCount: count };
}

export const embeddingWorker = new Worker<EmbeddingJobData>(
  QUEUE_NAMES.EMBEDDING,
  processEmbeddingJob,
  {
    connection: redisConnection,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 60_000, // max 10 embedding jobs per minute (rate limit protection)
    },
  }
);

embeddingWorker.on("failed", (job, err) => {
  console.error(`[embedding] Job ${job?.id} failed:`, err.message);
});
