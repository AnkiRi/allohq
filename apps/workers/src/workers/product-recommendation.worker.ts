import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";
import { buildAffinityMatrix, getRecommendations } from "@allohq/product-recommendations";

interface RecommendationJobData {
  type: "build-affinity" | "compute-recommendations" | "cron";
  storeId?: string;
  customerId?: string;
}

/**
 * Product recommendation worker.
 * - build-affinity: rebuilds affinity matrix for a store (daily cron)
 * - compute-recommendations: computes and caches recommendations for a customer
 */
export const productRecommendationWorker = new Worker<RecommendationJobData>(
  QUEUE_NAMES.PRODUCT_RECOMMENDATION,
  async (job) => {
    const { type, storeId, customerId } = job.data;

    // Cron job: build affinity for all active stores
    if (type === "cron" || (type === "build-affinity" && !storeId)) {
      const stores = await prisma.store.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      let totalPairs = 0;
      for (const store of stores) {
        const pairs = await buildAffinityMatrix(store.id);
        totalPairs += pairs;
      }

      console.log(`[product-recommendation] Built affinity matrices for ${stores.length} stores (${totalPairs} total pairs)`);
      return { stores: stores.length, totalPairs };
    }

    // Build affinity for a specific store
    if (type === "build-affinity" && storeId) {
      const pairs = await buildAffinityMatrix(storeId);
      console.log(`[product-recommendation] Built ${pairs} affinity pairs for store ${storeId}`);
      return { pairs };
    }

    // Compute recommendations for a specific customer
    if (type === "compute-recommendations" && storeId && customerId) {
      const results = await getRecommendations({
        storeId,
        customerId,
        limit: 20,
      });

      // Cache results in CustomerProductRecommendation table
      const expiresAt = new Date(Date.now() + 7 * 86400000); // 7-day TTL

      // Delete expired/old recommendations for this customer
      await prisma.customerProductRecommendation.deleteMany({
        where: { storeId, customerId },
      });

      // Insert new recommendations
      if (results.length > 0) {
        await prisma.customerProductRecommendation.createMany({
          data: results.map((r) => ({
            storeId,
            customerId,
            productId: r.productId,
            score: r.score,
            strategy: r.strategy,
            reason: r.reason,
            expiresAt,
          })),
        });
      }

      console.log(`[product-recommendation] Cached ${results.length} recommendations for customer ${customerId}`);
      return { recommendations: results.length };
    }

    console.warn(`[product-recommendation] Unknown job type: ${type}`);
    return { skipped: true };
  },
  { connection: redisConnection },
);

productRecommendationWorker.on("completed", (job) => {
  console.log(`[product-recommendation] Job ${job.id} completed`);
});

productRecommendationWorker.on("failed", (job, err) => {
  console.error(`[product-recommendation] Job ${job?.id} failed:`, err.message);
});
