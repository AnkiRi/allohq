import { Worker, Queue } from "bullmq";
import { prisma } from "@allohq/database";
import { analyzeBrandVoice } from "@allohq/customer-intelligence";
import { redisConnection, QUEUE_NAMES } from "../config";

const memoryWriterQueue = new Queue(QUEUE_NAMES.MEMORY_WRITER, { connection: redisConnection });

interface BrandAnalysisJobData {
  storeId: string;
  model?: string;
}

export const brandAnalysisWorker = new Worker<BrandAnalysisJobData>(
  QUEUE_NAMES.BRAND_ANALYSIS,
  async (job) => {
    const { storeId } = job.data;

    console.log(`[brand-analysis] Starting for store ${storeId} (attempt ${job.attemptsMade + 1})`);

    // Fetch store and products
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        products: {
          where: { status: "active" },
          take: 20,
          orderBy: { updatedAt: "desc" },
        },
      },
    });

    if (!store) {
      throw new Error(`Store ${storeId} not found`);
    }

    if (store.products.length === 0) {
      console.warn(`[brand-analysis] No products found for store ${storeId}, skipping`);
      return { skipped: true, reason: "no_products" };
    }

    // Run brand analysis
    const result = await analyzeBrandVoice(
      {
        storeName: store.shopDomain.replace(".myshopify.com", ""),
        products: store.products.map((p) => ({
          title: p.title,
          description: p.description ?? undefined,
          productType: p.productType ?? undefined,
          vendor: p.vendor ?? undefined,
          price: p.price,
        })),
      },
      job.data.model ? { model: job.data.model as any } : undefined,
    );

    // Record token usage
    await prisma.tokenUsage.create({
      data: {
        workspaceId: store.workspaceId,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        purpose: "brand_analysis",
      },
    });

    // Upsert brand profile
    await prisma.brandProfile.upsert({
      where: {
        workspaceId_storeId: {
          workspaceId: store.workspaceId,
          storeId: store.id,
        },
      },
      create: {
        workspaceId: store.workspaceId,
        storeId: store.id,
        brandName: result.brandName,
        brandDescription: result.brandDescription,
        toneAttributes: result.toneAttributes as any,
        vocabulary: result.vocabulary as any,
        visualStyle: result.visualStyle as any,
        sampleCopy: result.sampleCopy as any,
        analyzedAt: new Date(),
      },
      update: {
        brandName: result.brandName,
        brandDescription: result.brandDescription,
        toneAttributes: result.toneAttributes as any,
        vocabulary: result.vocabulary as any,
        visualStyle: result.visualStyle as any,
        sampleCopy: result.sampleCopy as any,
        analyzedAt: new Date(),
      },
    });

    // Queue a memory write for the brand analysis outcome
    await memoryWriterQueue.add("memory-write", {
      type: "brand_analysis_complete",
      storeId,
      payload: {
        brandName: result.brandName,
        brandDescription: result.brandDescription,
      },
    }).catch((err) => {
      console.warn(`[brand-analysis] Failed to queue memory write:`, (err as Error).message);
    });

    console.log(`[brand-analysis] Completed for store ${storeId}: ${result.brandName}`);
    return result;
  },
  {
    connection: redisConnection,
    // Retry up to 2 times with exponential backoff
    settings: {
      backoffStrategy: (attemptsMade: number) => Math.min(attemptsMade * 5000, 30000),
    },
  }
);

brandAnalysisWorker.on("completed", (job) => {
  console.log(`[brand-analysis] Job ${job.id} completed successfully`);
});

brandAnalysisWorker.on("failed", (job, err) => {
  console.error(`[brand-analysis] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
});
