import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { computeFullState, updateStateOnEvent } from "@allohq/customer-state";
import type { StateUpdateEvent } from "@allohq/customer-state";
import { redisConnection, QUEUE_NAMES } from "../config";

interface CustomerStateJobData {
  type: StateUpdateEvent["type"];
  customerId: string;
  storeId: string;
  data?: Record<string, unknown>;
}

export const customerStateUpdaterWorker = new Worker<CustomerStateJobData>(
  QUEUE_NAMES.CUSTOMER_STATE,
  async (job) => {
    const { type, customerId, storeId, data } = job.data;

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
