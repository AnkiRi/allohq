import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { generateDailyBriefing } from "@allohq/merchant-copilot";
import { redisConnection, QUEUE_NAMES } from "../config";

interface BriefingJobData {
  storeId?: string; // If set, generate for single store; otherwise all active stores
  type: string;
}

/**
 * Briefing generator worker.
 * Daily (per merchant timezone): generates and stores morning briefing.
 */
export const briefingGeneratorWorker = new Worker<BriefingJobData>(
  QUEUE_NAMES.MERCHANT_BRIEFING,
  async (job) => {
    const { storeId } = job.data;

    const storeIds: string[] = [];
    if (storeId) {
      storeIds.push(storeId);
    } else {
      const stores = await prisma.store.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      storeIds.push(...stores.map((s) => s.id));
    }

    let generated = 0;
    for (const sid of storeIds) {
      try {
        await generateDailyBriefing(sid);
        generated++;
      } catch (err) {
        console.error(`[briefing-generator] Error for store ${sid}:`, (err as Error).message);
      }
    }

    console.log(`[briefing-generator] Generated ${generated}/${storeIds.length} daily briefings`);
    return { generated, total: storeIds.length };
  },
  { connection: redisConnection },
);

briefingGeneratorWorker.on("completed", (job) => {
  console.log(`[briefing-generator] Job ${job.id} completed`);
});

briefingGeneratorWorker.on("failed", (job, err) => {
  console.error(`[briefing-generator] Job ${job?.id} failed:`, err.message);
});
