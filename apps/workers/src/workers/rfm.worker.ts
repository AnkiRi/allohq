import { Worker } from "bullmq";
import { redisConnection, QUEUE_NAMES } from "../config";

export const rfmWorker = new Worker(
  QUEUE_NAMES.RFM,
  async (_job) => {
    // TODO: Implement RFM calculation using @allohq/customer-intelligence
  },
  { connection: redisConnection }
);

rfmWorker.on("completed", (job) => {
  console.log(`RFM job ${job.id} completed`);
});

rfmWorker.on("failed", (job, err) => {
  console.error(`RFM job ${job?.id} failed:`, err.message);
});
