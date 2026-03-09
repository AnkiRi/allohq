import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { getRepurchaseDueCustomers } from "@allohq/proactive-outreach";
import { redisConnection, QUEUE_NAMES } from "../config";

interface RepurchaseReminderJobData {
  type?: string;
  storeId?: string;
}

export const repurchaseReminderWorker = new Worker<RepurchaseReminderJobData>(
  QUEUE_NAMES.REPURCHASE_REMINDER,
  async (job) => {
    const { storeId } = job.data;
    console.log(`[repurchase-reminder] Starting repurchase reminder check`);

    let totalNotified = 0;

    if (storeId) {
      // Single store
      const { notified } = await getRepurchaseDueCustomers(storeId);
      totalNotified = notified;
    } else {
      // All active stores (cron job)
      const stores = await prisma.store.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      for (const store of stores) {
        try {
          const { notified } = await getRepurchaseDueCustomers(store.id);
          totalNotified += notified;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[repurchase-reminder] Failed for store ${store.id}: ${message}`);
        }
      }
    }

    console.log(`[repurchase-reminder] Total reminders sent: ${totalNotified}`);
    return { totalNotified };
  },
  { connection: redisConnection },
);

repurchaseReminderWorker.on("completed", (job) => {
  console.log(`[repurchase-reminder] Job ${job.id} completed`);
});

repurchaseReminderWorker.on("failed", (job, err) => {
  console.error(`[repurchase-reminder] Job ${job?.id} failed:`, err.message);
});
