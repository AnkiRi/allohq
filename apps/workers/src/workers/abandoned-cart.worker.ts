import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";
import { checkEventTriggers } from "../utils/event-triggers";

/**
 * Abandoned Cart Detection Worker
 * Runs on a schedule (every 5 minutes) to mark open checkouts as "abandoned"
 * after a configurable threshold (default 60 minutes) and fire cart_abandoned triggers.
 */
export const abandonedCartWorker = new Worker(
  QUEUE_NAMES.ABANDONED_CART_CHECK,
  async () => {
    const abandonmentThresholdMinutes = 60;
    const cutoff = new Date(Date.now() - abandonmentThresholdMinutes * 60 * 1000);

    // Find open checkouts older than threshold
    const openCheckouts = await prisma.abandonedCheckout.findMany({
      where: {
        status: "open",
        createdAt: { lte: cutoff },
      },
      take: 200,
    });

    if (openCheckouts.length === 0) return;

    let marked = 0;
    for (const checkout of openCheckouts) {
      // Check if a matching order was placed by same customer
      if (checkout.customerId) {
        const hasOrder = await prisma.order.findFirst({
          where: {
            customerId: checkout.customerId,
            storeId: checkout.storeId,
            createdAt: { gte: checkout.createdAt },
          },
          select: { id: true },
        });

        if (hasOrder) {
          await prisma.abandonedCheckout.update({
            where: { id: checkout.id },
            data: { status: "recovered", recoveredAt: new Date() },
          });
          continue;
        }
      }

      // Mark as abandoned
      await prisma.abandonedCheckout.update({
        where: { id: checkout.id },
        data: { status: "abandoned", abandonedAt: new Date() },
      });
      marked++;

      // Fire cart_abandoned event trigger for automations
      if (checkout.customerId) {
        await checkEventTriggers(checkout.storeId, "cart_abandoned", checkout.customerId, checkout.id);
      }
    }

    if (marked > 0) {
      console.log(`[abandoned-cart] Marked ${marked} checkouts as abandoned`);
    }
  },
  { connection: redisConnection, concurrency: 1 }
);

abandonedCartWorker.on("completed", (job) => {
  console.log(`[abandoned-cart] Check job ${job.id} completed`);
});

abandonedCartWorker.on("failed", (job, err) => {
  console.error(`[abandoned-cart] Check job ${job?.id} failed:`, err.message);
});
