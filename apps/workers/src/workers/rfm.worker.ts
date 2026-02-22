import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import {
  scoreQuintile,
  getSegmentName,
  computeRfmRawData,
  calculateCustomerLtv,
  DEFAULT_SEGMENTS,
} from "@allohq/customer-intelligence";
import { redisConnection, QUEUE_NAMES } from "../config";

interface RfmJobData {
  storeId: string;
}

export const rfmWorker = new Worker<RfmJobData>(
  QUEUE_NAMES.RFM,
  async (job) => {
    const { storeId } = job.data;
    console.log(`Starting RFM calculation for store ${storeId}`);

    // 1. Init default segments (skip duplicates)
    await prisma.customerSegment.createMany({
      data: DEFAULT_SEGMENTS.map((s) => ({
        ...s,
        storeId,
        isSystem: true,
      })),
      skipDuplicates: true,
    });

    // 2. Fetch all customers with orders
    const customers = await prisma.customer.findMany({
      where: { storeId },
      include: {
        orders: {
          select: { totalPrice: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (customers.length === 0) {
      console.log("No customers found, skipping RFM calculation");
      return { rfmCalculated: 0, ltvCalculated: 0 };
    }

    const now = new Date();

    // 3. Calculate RFM scores
    const rawData = computeRfmRawData(
      customers.map((c) => ({ customerId: c.id, orders: c.orders })),
      now
    );

    const recencyValues = rawData.map((d) => d.daysSinceLastOrder);
    const frequencyValues = rawData.map((d) => d.orderCount);
    const monetaryValues = rawData.map((d) => d.totalSpent);

    let rfmCalculated = 0;
    for (const data of rawData) {
      const recency = scoreQuintile(data.daysSinceLastOrder, recencyValues, true);
      const frequency = scoreQuintile(data.orderCount, frequencyValues);
      const monetary = scoreQuintile(data.totalSpent, monetaryValues);
      const totalScore = recency + frequency + monetary;
      const segment = getSegmentName(recency, frequency, monetary);

      await prisma.rfmScore.upsert({
        where: { customerId: data.customerId },
        create: {
          customerId: data.customerId,
          storeId,
          recency,
          frequency,
          monetary,
          totalScore,
          segment,
          lastOrderAt: data.lastOrderAt,
          orderCount: data.orderCount,
          totalSpent: data.totalSpent,
          avgOrderValue: data.avgOrderValue,
        },
        update: {
          recency,
          frequency,
          monetary,
          totalScore,
          segment,
          lastOrderAt: data.lastOrderAt,
          orderCount: data.orderCount,
          totalSpent: data.totalSpent,
          avgOrderValue: data.avgOrderValue,
          calculatedAt: new Date(),
        },
      });
      rfmCalculated++;
    }

    console.log(`RFM scores calculated for ${rfmCalculated} customers`);

    // 4. Calculate LTV
    let ltvCalculated = 0;
    for (const c of customers) {
      const result = calculateCustomerLtv(
        { customerId: c.id, orders: c.orders },
        now
      );
      if (!result) continue;

      await prisma.customerLifetimeValue.upsert({
        where: { customerId: c.id },
        create: {
          customerId: c.id,
          storeId,
          historicalLtv: result.historicalLtv,
          predictedLtv: result.predictedLtv,
          avgOrderValue: result.avgOrderValue,
          purchaseFrequency: result.purchaseFrequency,
          customerLifespan: result.customerLifespan,
          churnProbability: result.churnProbability,
        },
        update: {
          historicalLtv: result.historicalLtv,
          predictedLtv: result.predictedLtv,
          avgOrderValue: result.avgOrderValue,
          purchaseFrequency: result.purchaseFrequency,
          customerLifespan: result.customerLifespan,
          churnProbability: result.churnProbability,
          lastCalculatedAt: new Date(),
        },
      });
      ltvCalculated++;
    }

    console.log(`LTV calculated for ${ltvCalculated} customers`);

    // 5. Update segment customer counts and revenue
    const segmentCounts = await prisma.rfmScore.groupBy({
      by: ["segment"],
      where: { storeId },
      _count: { id: true },
      _sum: { totalSpent: true },
    });

    for (const sc of segmentCounts) {
      await prisma.customerSegment.updateMany({
        where: { storeId, name: sc.segment },
        data: {
          customerCount: sc._count.id,
          totalRevenue: sc._sum.totalSpent ?? 0,
        },
      });
    }

    console.log(`RFM job completed for store ${storeId}: ${rfmCalculated} RFM, ${ltvCalculated} LTV`);
    return { rfmCalculated, ltvCalculated };
  },
  { connection: redisConnection }
);

rfmWorker.on("completed", (job) => {
  console.log(`RFM job ${job.id} completed`);
});

rfmWorker.on("failed", (job, err) => {
  console.error(`RFM job ${job?.id} failed:`, err.message);
});
