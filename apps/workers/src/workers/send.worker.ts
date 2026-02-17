import { Worker } from "bullmq";
import { redisConnection, QUEUE_NAMES } from "../config";

export const sendWorker = new Worker(
  QUEUE_NAMES.EMAIL_SEND,
  async (_job) => {
    // TODO: Implement message sending
  },
  { connection: redisConnection }
);

sendWorker.on("completed", (job) => {
  console.log(`Send job ${job.id} completed`);
});

sendWorker.on("failed", (job, err) => {
  console.error(`Send job ${job?.id} failed:`, err.message);
});
