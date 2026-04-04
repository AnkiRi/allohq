import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { discoverProductSegments, saveProductSegments } from "@allohq/customer-intelligence";
import { redisConnection, QUEUE_NAMES } from "../config";

interface ProductSegmentsJobData {
  storeId?: string; // If not provided, runs for all active stores
}

export const productSegmentsWorker = new Worker<ProductSegmentsJobData>(
  QUEUE_NAMES.PRODUCT_SEGMENTS,
  async (job) => {
    const storeIds: string[] = [];

    if (job.data.storeId) {
      storeIds.push(job.data.storeId);
    } else {
      const stores = await prisma.store.findMany({
        where: { isActive: true, onboardingCompletedAt: { not: null } },
        select: { id: true },
      });
      storeIds.push(...stores.map(s => s.id));
    }

    let totalSegments = 0;

    for (const storeId of storeIds) {
      try {
        console.log(`[product-segments] Analyzing store ${storeId}`);
        const { segments, memberships } = await discoverProductSegments(storeId);
        const saved = await saveProductSegments(storeId, segments, memberships);
        totalSegments += saved;
        console.log(`[product-segments] Store ${storeId}: ${saved} segments discovered`);
      } catch (err) {
        console.error(`[product-segments] Error for store ${storeId}:`, (err as Error).message);
      }
    }

    console.log(`[product-segments] Complete: ${totalSegments} segments across ${storeIds.length} stores`);
    return { storesProcessed: storeIds.length, totalSegments };
  },
  { connection: redisConnection, concurrency: 1 },
);

productSegmentsWorker.on("completed", (job) => {
  console.log(`[product-segments] Job ${job.id} completed`);
});

productSegmentsWorker.on("failed", (job, err) => {
  console.error(`[product-segments] Job ${job?.id} failed:`, err.message);
});
