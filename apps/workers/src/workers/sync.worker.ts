import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { shopify } from "@allohq/ecommerce-integrations";
const { syncAllProducts, syncAllCustomers, syncAllOrders, registerWebhooks } = shopify;
import { redisConnection, QUEUE_NAMES } from "../config";

interface SyncJobData {
  storeId: string;
  shopDomain: string;
  accessToken: string;
  platform: string;
}

interface SyncResult {
  imported: number;
  errors: string[];
}

const EMPTY_RESULT: SyncResult = { imported: 0, errors: [] };

export const syncWorker = new Worker<SyncJobData>(
  QUEUE_NAMES.SYNC,
  async (job) => {
    const { storeId, shopDomain, accessToken, platform } = job.data;

    if (platform !== "shopify") {
      console.log(`Sync for platform "${platform}" not yet implemented`);
      return;
    }

    console.log(`Starting full sync for store ${storeId} (${shopDomain})`);

    // 1. Sync products
    await job.updateProgress(10);
    let productResult: SyncResult = EMPTY_RESULT;
    try {
      productResult = await syncAllProducts(shopDomain, accessToken, storeId, prisma);
      console.log(`Products synced: ${productResult.imported} imported, ${productResult.errors.length} errors`);
    } catch (err: any) {
      console.warn(`Products sync skipped: ${err.message}`);
    }

    // 2. Sync customers
    await job.updateProgress(40);
    let customerResult: SyncResult = EMPTY_RESULT;
    try {
      customerResult = await syncAllCustomers(shopDomain, accessToken, storeId, prisma);
      console.log(`Customers synced: ${customerResult.imported} imported, ${customerResult.errors.length} errors`);
    } catch (err: any) {
      console.warn(`Customers sync skipped: ${err.message}`);
    }

    // 3. Sync orders (depends on customers being synced)
    await job.updateProgress(70);
    let orderResult: SyncResult = EMPTY_RESULT;
    try {
      orderResult = await syncAllOrders(shopDomain, accessToken, storeId, prisma);
      console.log(`Orders synced: ${orderResult.imported} imported, ${orderResult.errors.length} errors`);
    } catch (err: any) {
      console.warn(`Orders sync skipped: ${err.message}`);
    }

    // 4. Register webhooks for incremental updates
    await job.updateProgress(90);
    const webhookBaseUrl = process.env["WEBHOOK_BASE_URL"];
    if (webhookBaseUrl) {
      try {
        const webhookResult = await registerWebhooks({ shopDomain, accessToken, webhookBaseUrl });
        console.log(`Webhooks registered: ${webhookResult.registered.length}, errors: ${webhookResult.errors.length}`);
      } catch (err: any) {
        console.warn(`Webhook registration skipped: ${err.message}`);
      }
    } else {
      console.warn("WEBHOOK_BASE_URL not set, skipping webhook registration");
    }

    // 5. Update lastSyncAt
    await prisma.store.update({
      where: { id: storeId },
      data: { lastSyncAt: new Date() },
    });

    await job.updateProgress(100);
    console.log(`Full sync completed for store ${storeId}`);

    return {
      products: productResult,
      customers: customerResult,
      orders: orderResult,
    };
  },
  { connection: redisConnection }
);

syncWorker.on("completed", (job) => {
  console.log(`Sync job ${job.id} completed`);
});

syncWorker.on("failed", (job, err) => {
  console.error(`Sync job ${job?.id} failed:`, err.message);
});
