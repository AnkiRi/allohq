import { Worker } from "bullmq";
import { recalculateSendTimes } from "@allohq/journey-orchestrator";
import { redisConnection, QUEUE_NAMES } from "../config";

interface SendTimeJobData {
  storeId: string;
}

/**
 * Send Time Optimizer Worker
 * Nightly job that recalculates per-customer optimal send times
 * based on engagement data (opens, clicks, conversions).
 */
export const sendTimeOptimizerWorker = new Worker<SendTimeJobData>(
  QUEUE_NAMES.SEND_TIME,
  async (job) => {
    const { storeId } = job.data;

    console.log(`Recalculating optimal send times for store ${storeId}`);

    const updated = await recalculateSendTimes(storeId);

    console.log(`Send time optimization complete: ${updated} customers updated`);
    return { updated };
  },
  { connection: redisConnection },
);

sendTimeOptimizerWorker.on("completed", (job) => {
  console.log(`Send time optimization job ${job.id} completed`);
});

sendTimeOptimizerWorker.on("failed", (job, err) => {
  console.error(`Send time optimization job ${job?.id} failed:`, err.message);
});
