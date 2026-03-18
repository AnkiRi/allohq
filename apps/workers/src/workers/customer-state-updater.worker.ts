import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { computeFullState, updateStateOnEvent, decayStaleStates } from "@allohq/customer-state";
import type { StateUpdateEvent } from "@allohq/customer-state";
import { redisConnection, QUEUE_NAMES } from "../config";

interface CustomerStateJobData {
  type: StateUpdateEvent["type"] | "state_decay";
  customerId: string;
  storeId: string;
  data?: Record<string, unknown>;
}

export const customerStateUpdaterWorker = new Worker<CustomerStateJobData>(
  QUEUE_NAMES.CUSTOMER_STATE,
  async (job) => {
    const { type, customerId, storeId, data } = job.data;

    // Daily state decay — recompute stale states across all active stores
    if (type === "state_decay") {
      const stores = await prisma.store.findMany({
        where: { isActive: true, onboardingCompletedAt: { not: null } },
        select: { id: true },
      });
      let totalUpdated = 0;
      for (const store of stores) {
        const updated = await decayStaleStates(store.id);
        totalUpdated += updated;
      }
      console.log(`[customer-state] Decayed ${totalUpdated} stale states across ${stores.length} stores`);
      return;
    }

    console.log(`[customer-state] Processing ${type} for customer ${customerId}`);

    // Verify customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      console.warn(`[customer-state] Customer ${customerId} not found, skipping`);
      return;
    }

    if (type === "full_recalculation") {
      await computeFullState(customerId, storeId);
      console.log(`[customer-state] Full state computed for ${customerId}`);
    } else {
      const event: StateUpdateEvent = {
        type,
        customerId,
        storeId,
        data,
        timestamp: new Date(),
      };
      await updateStateOnEvent(event);
      console.log(`[customer-state] State updated on ${type} for ${customerId}`);
    }
  },
  { connection: redisConnection }
);

customerStateUpdaterWorker.on("completed", (job) => {
  console.log(`[customer-state] Job ${job.id} completed`);
});

customerStateUpdaterWorker.on("failed", (job, err) => {
  console.error(`[customer-state] Job ${job?.id} failed:`, err.message);
});
