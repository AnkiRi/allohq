import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";

interface ProductCyclesJobData {
  storeId: string;
}

/**
 * Product repurchase cycle analyzer.
 * Daily job: calculates median/avg repurchase intervals per product.
 * Uses order history to find repeat purchase patterns.
 */
export const productCycleAnalyzerWorker = new Worker<ProductCyclesJobData>(
  QUEUE_NAMES.PRODUCT_CYCLES,
  async (job) => {
    const { storeId } = job.data;
    console.log(`[product-cycle-analyzer] Analyzing repurchase cycles for store ${storeId}`);

    // Get all products with order items
    const products = await prisma.product.findMany({
      where: { storeId, status: "active" },
      select: { id: true },
    });

    let analyzed = 0;

    for (const product of products) {
      // Find customers who ordered this product more than once
      const orderItems = await prisma.orderItem.findMany({
        where: { productId: product.id },
        select: {
          order: {
            select: { customerId: true, createdAt: true },
          },
        },
        orderBy: { order: { createdAt: "asc" } },
      });

      // Group by customer
      const customerOrders: Record<string, Date[]> = {};
      for (const item of orderItems) {
        const cid = item.order.customerId;
        if (!customerOrders[cid]) customerOrders[cid] = [];
        customerOrders[cid]!.push(item.order.createdAt);
      }

      // Calculate intervals for customers with 2+ orders of this product
      const intervals: number[] = [];
      for (const dates of Object.values(customerOrders)) {
        if (dates.length < 2) continue;
        dates.sort((a, b) => a.getTime() - b.getTime());
        for (let i = 1; i < dates.length; i++) {
          const daysBetween = (dates[i]!.getTime() - dates[i - 1]!.getTime()) / 86400000;
          if (daysBetween > 1) { // Ignore same-day re-orders
            intervals.push(daysBetween);
          }
        }
      }

      if (intervals.length < 2) continue; // Need at least 2 intervals for meaningful data

      // Calculate median and average
      intervals.sort((a, b) => a - b);
      const mid = Math.floor(intervals.length / 2);
      const medianDays = intervals.length % 2 === 0
        ? (intervals[mid - 1]! + intervals[mid]!) / 2
        : intervals[mid]!;
      const avgDays = intervals.reduce((sum, d) => sum + d, 0) / intervals.length;

      // Confidence based on sample size (0-1)
      const confidence = Math.min(1, intervals.length / 20);

      await prisma.productRepurchaseCycle.upsert({
        where: { productId: product.id },
        create: {
          productId: product.id,
          storeId,
          medianDays,
          avgDays,
          sampleSize: intervals.length,
          confidence,
          lastCalculated: new Date(),
        },
        update: {
          medianDays,
          avgDays,
          sampleSize: intervals.length,
          confidence,
          lastCalculated: new Date(),
        },
      });

      analyzed++;
    }

    console.log(`[product-cycle-analyzer] Analyzed ${analyzed}/${products.length} products for store ${storeId}`);
    return { totalProducts: products.length, analyzed };
  },
  { connection: redisConnection },
);

productCycleAnalyzerWorker.on("completed", (job) => {
  console.log(`[product-cycle-analyzer] Job ${job.id} completed`);
});

productCycleAnalyzerWorker.on("failed", (job, err) => {
  console.error(`[product-cycle-analyzer] Job ${job?.id} failed:`, err.message);
});
