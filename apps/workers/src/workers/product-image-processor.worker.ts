import { Worker } from "bullmq";
import { processAllProductImages, processProductImageById } from "@allohq/creative-engine";
import { redisConnection, QUEUE_NAMES } from "../config";

interface ProductImageJobData {
  storeId: string;
  productId?: string; // If set, process single product; otherwise process all
}

/**
 * Product image processing worker.
 * Triggered after Shopify product webhooks or full product sync.
 * Downloads product images, removes backgrounds, applies brand colours,
 * generates multi-size variants.
 */
export const productImageProcessorWorker = new Worker<ProductImageJobData>(
  QUEUE_NAMES.PRODUCT_IMAGE,
  async (job) => {
    const { storeId, productId } = job.data;

    if (productId) {
      console.log(`[product-image-processor] Processing single product ${productId} for store ${storeId}`);
      await processProductImageById(storeId, productId);
      return { storeId, productId, status: "processed" };
    }

    console.log(`[product-image-processor] Processing all products for store ${storeId}`);
    const result = await processAllProductImages(storeId);
    return { storeId, ...result };
  },
  { connection: redisConnection },
);

productImageProcessorWorker.on("completed", (job) => {
  console.log(`[product-image-processor] Job ${job.id} completed`);
});

productImageProcessorWorker.on("failed", (job, err) => {
  console.error(`[product-image-processor] Job ${job?.id} failed:`, err.message);
});
