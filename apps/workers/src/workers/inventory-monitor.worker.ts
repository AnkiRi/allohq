import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { checkInventoryLevels } from "@allohq/proactive-outreach";
import { redisConnection, QUEUE_NAMES } from "../config";

interface InventoryMonitorJobData {
  type?: string;
  storeId?: string;
}

export const inventoryMonitorWorker = new Worker<InventoryMonitorJobData>(
  QUEUE_NAMES.INVENTORY_MONITOR,
  async (job) => {
    const { storeId } = job.data;
    console.log(`[inventory-monitor] Starting inventory check`);

    let totalAlerts = 0;

    if (storeId) {
      const alerts = await checkInventoryLevels(storeId);
      totalAlerts = alerts.length;
    } else {
      // All active stores (cron job)
      const stores = await prisma.store.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      for (const store of stores) {
        try {
          const alerts = await checkInventoryLevels(store.id);
          totalAlerts += alerts.length;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[inventory-monitor] Failed for store ${store.id}: ${message}`);
        }
      }
    }

    console.log(`[inventory-monitor] Total low-stock alerts created: ${totalAlerts}`);
    return { totalAlerts };
  },
  { connection: redisConnection },
);

inventoryMonitorWorker.on("completed", (job) => {
  console.log(`[inventory-monitor] Job ${job.id} completed`);
});

inventoryMonitorWorker.on("failed", (job, err) => {
  console.error(`[inventory-monitor] Job ${job?.id} failed:`, err.message);
});
