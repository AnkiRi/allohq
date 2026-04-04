import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { analyzeBasketPatterns, saveBasketArchetypes } from "@allohq/customer-intelligence";
import { redisConnection, QUEUE_NAMES } from "../config";

interface BasketAnalysisJobData {
  storeId?: string; // If omitted, runs for all active stores
}

export const basketAnalysisWorker = new Worker<BasketAnalysisJobData>(
  QUEUE_NAMES.BASKET_ANALYSIS,
  async (job) => {
    const { storeId } = job.data;

    // Determine which stores to process
    let storeIds: string[];
    if (storeId) {
      storeIds = [storeId];
    } else {
      const stores = await prisma.store.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      storeIds = stores.map((s) => s.id);
    }

    console.log(`[basket-analysis] Processing ${storeIds.length} store(s)`);

    let totalArchetypes = 0;

    for (const sid of storeIds) {
      try {
        const patterns = await analyzeBasketPatterns(sid);
        const archetypesSaved = await saveBasketArchetypes(sid, patterns);
        totalArchetypes += archetypesSaved;
        console.log(`[basket-analysis] Store ${sid}: ${archetypesSaved} basket archetypes from ${patterns.length} patterns`);
      } catch (err) {
        console.error(`[basket-analysis] Store ${sid} failed:`, (err as Error).message);
      }
    }

    console.log(`[basket-analysis] Done: ${totalArchetypes} total archetypes across ${storeIds.length} stores`);
    return { storesProcessed: storeIds.length, totalArchetypes };
  },
  { connection: redisConnection }
);

basketAnalysisWorker.on("completed", (job) => {
  console.log(`[basket-analysis] Job ${job.id} completed`);
});

basketAnalysisWorker.on("failed", (job, err) => {
  console.error(`[basket-analysis] Job ${job?.id} failed:`, err.message);
});
