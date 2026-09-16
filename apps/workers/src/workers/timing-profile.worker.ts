import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { rebuildSendTimeProfiles } from "@allohq/customer-intelligence";
import { QUEUE_NAMES, redisConnection } from "../config";

interface TimingProfileJob {
  type: "all_stores" | "store";
  storeId?: string;
}

export const timingProfileWorker = new Worker<TimingProfileJob>(
  QUEUE_NAMES.TIMING_PROFILE,
  async (job) => {
    const storeIds = job.data.storeId
      ? [job.data.storeId]
      : (
          await prisma.store.findMany({
            where: { isActive: true, onboardingCompletedAt: { not: null } },
            select: { id: true },
          })
        ).map((store) => store.id);
    const results = [];
    for (const storeId of storeIds) {
      const result = await rebuildSendTimeProfiles(storeId);
      results.push({ storeId, ...result });
    }
    console.log("[timing-profile] Rebuilt delivery windows", {
      stores: results.length,
      customerProfiles: results.reduce((sum, result) => sum + result.customerProfiles, 0),
      storeEvidence: results.reduce((sum, result) => sum + result.storeEvidence, 0),
    });
    return results;
  },
  { connection: redisConnection }
);

timingProfileWorker.on("failed", (job, error) => {
  console.error(`[timing-profile] Job ${job?.id ?? "unknown"} failed`, error.message);
});
