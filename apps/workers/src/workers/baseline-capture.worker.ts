import { Worker } from "bullmq";
import { captureBaseline } from "@allohq/merchant-copilot";
import { redisConnection, QUEUE_NAMES } from "../config";

interface BaselineJobData {
  storeId: string;
}

/**
 * Baseline capture worker.
 * Triggered on store connect: captures metrics snapshot for before/after comparison.
 */
export const baselineCaptureWorker = new Worker<BaselineJobData>(
  QUEUE_NAMES.BASELINE,
  async (job) => {
    const { storeId } = job.data;
    console.log(`[baseline-capture] Capturing baseline for store ${storeId}`);

    const metrics = await captureBaseline(storeId);

    return {
      storeId,
      customerCount: metrics.customerCount,
      totalRevenue: metrics.totalRevenue,
    };
  },
  { connection: redisConnection },
);

baselineCaptureWorker.on("completed", (job) => {
  console.log(`[baseline-capture] Job ${job.id} completed`);
});

baselineCaptureWorker.on("failed", (job, err) => {
  console.error(`[baseline-capture] Job ${job?.id} failed:`, err.message);
});
