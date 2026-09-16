import { Queue, Worker } from "bullmq";
import { prisma } from "@allohq/database";
import {
  computeFullState,
  updateStateOnEvent,
  drainDueStateEvaluations,
} from "@allohq/customer-state";
import type { StateUpdateEvent } from "@allohq/customer-state";
import { redisConnection, QUEUE_NAMES } from "../config";

interface CustomerStateJobData {
  type: StateUpdateEvent["type"] | "state_decay" | "state_due_store";
  customerId?: string;
  storeId?: string;
  data?: Record<string, unknown>;
}

const customerStateQueue = new Queue<CustomerStateJobData>(QUEUE_NAMES.CUSTOMER_STATE, {
  connection: redisConnection,
});

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
      for (const store of stores) {
        await customerStateQueue.add(
          "state-due-store",
          { type: "state_due_store", storeId: store.id },
          { jobId: `state-due-${store.id}-${new Date().toISOString().slice(0, 10)}` }
        );
      }
      console.log(`[customer-state] Queued due-state evaluation for ${stores.length} stores`);
      return;
    }

    if (type === "state_due_store") {
      if (!storeId) throw new Error("state_due_store requires storeId");
      const result = await drainDueStateEvaluations(storeId, {
        batchSize: 250,
        maxBatches: 8,
        concurrency: 10,
      });
      console.log(`[customer-state] Due-state evaluation completed`, {
        storeId,
        claimed: result.claimed,
        updated: result.updated,
        failed: result.failed,
        batches: result.batches,
        hasMore: result.hasMore,
        oldestDueAt: result.oldestDueAt?.toISOString() ?? null,
      });
      if (result.hasMore) {
        await customerStateQueue.add(
          "state-due-store-continuation",
          { type: "state_due_store", storeId },
          {
            jobId: `state-due-${storeId}-${Date.now()}`,
            delay: 1_000,
          }
        );
      }
      return;
    }

    if (!customerId || !storeId) throw new Error(`${type} requires customerId and storeId`);

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
