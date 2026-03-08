import { Worker } from "bullmq";
import { extractBrandKit } from "@allohq/creative-engine";
import { redisConnection, QUEUE_NAMES } from "../config";

interface BrandKitJobData {
  storeId: string;
}

/**
 * Brand kit extraction worker.
 * Triggered on store connect + weekly refresh.
 * Extracts colours, fonts, logo, aesthetic classification from Shopify theme.
 */
export const brandKitExtractorWorker = new Worker<BrandKitJobData>(
  QUEUE_NAMES.BRAND_KIT,
  async (job) => {
    const { storeId } = job.data;
    console.log(`[brand-kit-extractor] Extracting brand kit for store ${storeId}`);

    await extractBrandKit(storeId);

    return { storeId, status: "extracted" };
  },
  { connection: redisConnection },
);

brandKitExtractorWorker.on("completed", (job) => {
  console.log(`[brand-kit-extractor] Job ${job.id} completed`);
});

brandKitExtractorWorker.on("failed", (job, err) => {
  console.error(`[brand-kit-extractor] Job ${job?.id} failed:`, err.message);
});
