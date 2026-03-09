import { Worker } from "bullmq";
import { processShippingUpdate } from "@allohq/proactive-outreach";
import { redisConnection, QUEUE_NAMES } from "../config";

interface ShippingUpdateJobData {
  storeId: string;
  fulfillmentId: string;
}

export const shippingUpdateWorker = new Worker<ShippingUpdateJobData>(
  QUEUE_NAMES.SHIPPING_UPDATE,
  async (job) => {
    const { storeId, fulfillmentId } = job.data;
    console.log(`[shipping-update] Processing fulfillment ${fulfillmentId}`);

    const result = await processShippingUpdate(storeId, fulfillmentId);

    if (result.sent) {
      console.log(`[shipping-update] Notification sent via ${result.channel} for fulfillment ${fulfillmentId}`);
    } else {
      console.log(`[shipping-update] No notification sent: ${result.reason}`);
    }

    return result;
  },
  { connection: redisConnection },
);

shippingUpdateWorker.on("completed", (job) => {
  console.log(`[shipping-update] Job ${job.id} completed`);
});

shippingUpdateWorker.on("failed", (job, err) => {
  console.error(`[shipping-update] Job ${job?.id} failed:`, err.message);
});
