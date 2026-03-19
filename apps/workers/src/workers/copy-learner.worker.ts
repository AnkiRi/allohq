import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { analyzeCopyPatterns, generateCopyBrief } from "@allohq/campaign-engine";
import { logActivity } from "@allohq/agent-core";
import { redisConnection, QUEUE_NAMES } from "../config";

interface CopyLearnerJobData {
  type: string;
  storeId?: string;
}

/**
 * Copy Learner Worker
 * Runs weekly. For each active store, analyses messaging copy patterns
 * to determine which styles (urgency, curiosity, social proof, etc.)
 * drive the best engagement, then logs insights to AgentActivityLog.
 */
export const copyLearnerWorker = new Worker<CopyLearnerJobData>(
  QUEUE_NAMES.COPY_LEARNER,
  async (job) => {
    const { storeId } = job.data;

    console.log(
      storeId
        ? `[copy-learner] Running copy analysis for store ${storeId}`
        : "[copy-learner] Running weekly copy analysis for all stores",
    );

    // Get stores to analyse
    const stores = storeId
      ? await prisma.store.findMany({
          where: { id: storeId, isActive: true },
          select: { id: true, storeName: true },
        })
      : await prisma.store.findMany({
          where: { isActive: true },
          select: { id: true, storeName: true },
        });

    if (stores.length === 0) {
      console.log("[copy-learner] No active stores to analyse");
      return { storesAnalysed: 0 };
    }

    let storesAnalysed = 0;
    let totalPatterns = 0;
    let totalRecords = 0;

    for (const store of stores) {
      try {
        const result = await analyzeCopyPatterns(store.id);
        storesAnalysed++;
        totalPatterns += result.patternsFound;
        totalRecords += result.recordsWritten;

        // Generate a copy brief and log it
        if (result.recordsWritten > 0) {
          const brief = await generateCopyBrief(store.id);

          await logActivity({
            storeId: store.id,
            activityType: "copy_analysis",
            summary: `Weekly copy analysis complete: ${result.patternsFound} patterns found across ${result.recordsWritten / 3} unique patterns. ${brief}`,
            category: "self_optimization",
            actionTaken: "analysed_copy_patterns",
            metadata: {
              patternsFound: result.patternsFound,
              recordsWritten: result.recordsWritten,
            },
          });
        }

        console.log(
          `[copy-learner] Store ${store.storeName ?? store.id}: ${result.patternsFound} patterns, ${result.recordsWritten} records`,
        );
      } catch (err: any) {
        console.error(
          `[copy-learner] Failed for store ${store.id}:`,
          err.message,
        );
      }
    }

    console.log(
      `[copy-learner] Done: ${storesAnalysed} stores analysed, ${totalPatterns} total patterns, ${totalRecords} records written`,
    );

    return { storesAnalysed, totalPatterns, totalRecords };
  },
  { connection: redisConnection },
);

copyLearnerWorker.on("completed", (job) => {
  console.log(`[copy-learner] Job ${job.id} completed`);
});

copyLearnerWorker.on("failed", (job, err) => {
  console.error(`[copy-learner] Job ${job?.id} failed:`, err.message);
});
