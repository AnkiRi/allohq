import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { generateWeeklyBriefing } from "@allohq/merchant-copilot";
import { redisConnection, QUEUE_NAMES } from "../config";

interface WeeklyReportJobData {
  storeId?: string;
  type: string;
}

/**
 * Weekly report worker.
 * Sunday night: generates weekly intelligence report for all active stores.
 */
export const weeklyReportWorker = new Worker<WeeklyReportJobData>(
  QUEUE_NAMES.WEEKLY_REPORT,
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
        await generateWeeklyBriefing(sid);
        generated++;
      } catch (err) {
        console.error(`[weekly-report] Error for store ${sid}:`, (err as Error).message);
      }
    }

    console.log(`[weekly-report] Generated ${generated}/${storeIds.length} weekly reports`);
    return { generated, total: storeIds.length };
  },
  { connection: redisConnection },
);

weeklyReportWorker.on("completed", (job) => {
  console.log(`[weekly-report] Job ${job.id} completed`);
});

weeklyReportWorker.on("failed", (job, err) => {
  console.error(`[weekly-report] Job ${job?.id} failed:`, err.message);
});
