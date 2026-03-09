import { Worker } from "bullmq";
import { processPriceDrop } from "@allohq/proactive-outreach";
import { redisConnection, QUEUE_NAMES } from "../config";

interface PriceDropJobData {
  storeId: string;
  productId: string;
  oldPrice: number;
  newPrice: number;
}

export const priceDropWorker = new Worker<PriceDropJobData>(
  QUEUE_NAMES.PRICE_DROP,
  async (job) => {
    const { storeId, productId, oldPrice, newPrice } = job.data;
    console.log(`[price-drop] Processing price drop for product ${productId}: $${oldPrice} → $${newPrice}`);

    const { notified, results } = await processPriceDrop(storeId, productId, oldPrice, newPrice);

    console.log(`[price-drop] Notified ${notified} customers about price drop`);
    return { notified, total: results.length };
  },
  { connection: redisConnection },
);

priceDropWorker.on("completed", (job) => {
  console.log(`[price-drop] Job ${job.id} completed`);
});

priceDropWorker.on("failed", (job, err) => {
  console.error(`[price-drop] Job ${job?.id} failed:`, err.message);
});
