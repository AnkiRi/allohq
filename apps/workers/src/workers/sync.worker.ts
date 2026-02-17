import { Worker } from "bullmq";
import { redisConnection, QUEUE_NAMES } from "../config";

export const syncWorker = new Worker(
  QUEUE_NAMES.SYNC,
  async (_job) => {
    // TODO: Implement Shopify/platform sync
  },
  { connection: redisConnection }
);

syncWorker.on("completed", (job) => {
  console.log(`Sync job ${job.id} completed`);
});

syncWorker.on("failed", (job, err) => {
  console.error(`Sync job ${job?.id} failed:`, err.message);
});
