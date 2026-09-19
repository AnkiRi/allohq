import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";
import { formatStoreMoney } from "../utils/format-money";
import { storeCurrency } from "../utils/store-currency";

interface MemoryWriterJobData {
  type: "campaign_complete" | "brand_analysis_complete";
  storeId: string;
  payload: Record<string, unknown>;
}

export const memoryWriterWorker = new Worker<MemoryWriterJobData>(
  QUEUE_NAMES.MEMORY_WRITER,
  async (job) => {
    const { type, storeId, payload } = job.data;

    console.log(`[memory-writer] Processing ${type} for store ${storeId}`);

    switch (type) {
      case "campaign_complete": {
        const name = payload.name as string ?? "Unknown";
        const recipientCount = payload.recipientCount as number ?? 0;
        const openRate = payload.openRate as number ?? 0;
        const clickRate = payload.clickRate as number ?? 0;
        const revenue = payload.revenue as number ?? 0;

        // This memory feeds the agent's own context, so a dollar sign on an
        // Indian store would teach it the wrong currency as well as show it.
        const content = `Campaign "${name}" sent to ${recipientCount} recipients. Open rate: ${openRate}%. Click rate: ${clickRate}%. Revenue: ${formatStoreMoney(revenue, await storeCurrency(storeId))}.`;

        await prisma.agentMemory.create({
          data: {
            storeId,
            memoryType: "campaign_outcome",
            content,
            importance: revenue > 0 ? 0.8 : 0.5,
            metadata: payload as any,
          },
        });

        console.log(`[memory-writer] Saved campaign outcome memory for store ${storeId}`);
        break;
      }

      case "brand_analysis_complete": {
        const brandName = payload.brandName as string ?? "Unknown";
        const description = payload.brandDescription as string ?? "";

        const content = `Brand analysis completed: "${brandName}". ${description.slice(0, 200)}`;

        await prisma.agentMemory.create({
          data: {
            storeId,
            memoryType: "store_pattern",
            content,
            importance: 0.6,
            metadata: { brandName, analyzedAt: new Date().toISOString() },
          },
        });

        console.log(`[memory-writer] Saved brand analysis memory for store ${storeId}`);
        break;
      }

      default:
        console.warn(`[memory-writer] Unknown job type: ${type}`);
    }

    return { success: true };
  },
  {
    connection: redisConnection,
    settings: {
      backoffStrategy: (attemptsMade: number) => Math.min(attemptsMade * 5000, 30000),
    },
  }
);

memoryWriterWorker.on("completed", (job) => {
  console.log(`[memory-writer] Job ${job.id} completed successfully`);
});

memoryWriterWorker.on("failed", (job, err) => {
  console.error(`[memory-writer] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
});
