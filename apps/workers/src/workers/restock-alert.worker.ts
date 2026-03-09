import { Worker } from "bullmq";
import { processRestockAlert } from "@allohq/proactive-outreach";
import { redisConnection, QUEUE_NAMES } from "../config";

interface RestockAlertJobData {
  storeId: string;
  productId: string;
}

export const restockAlertWorker = new Worker<RestockAlertJobData>(
  QUEUE_NAMES.RESTOCK_ALERT,
  async (job) => {
    const { storeId, productId } = job.data;
    console.log(`[restock-alert] Processing restock for product ${productId}`);

    const { notified, results } = await processRestockAlert(storeId, productId);

    console.log(`[restock-alert] Notified ${notified} customers about product ${productId}`);
    return { notified, total: results.length };
  },
  { connection: redisConnection },
);

restockAlertWorker.on("completed", (job) => {
  console.log(`[restock-alert] Job ${job.id} completed`);
});

restockAlertWorker.on("failed", (job, err) => {
  console.error(`[restock-alert] Job ${job?.id} failed:`, err.message);
});
