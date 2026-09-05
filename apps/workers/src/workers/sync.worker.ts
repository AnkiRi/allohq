import { Worker, Queue } from "bullmq";
import { prisma } from "@allohq/database";
import { shopify } from "@allohq/ecommerce-integrations";
const {
  syncShopMetadata,
  syncAllProducts,
  syncAllCustomers,
  syncAllOrders,
  syncAllCollections,
  registerWebhooks,
  registerWebPixel,
  getShopifyAdminClient,
} = shopify;
import { redisConnection, QUEUE_NAMES } from "../config";
import { rfmQueue } from "../queues";
import { logActivity } from "@allohq/agent-core";

const productImageQueue = new Queue(QUEUE_NAMES.PRODUCT_IMAGE, { connection: redisConnection });
const brandKitQueue = new Queue(QUEUE_NAMES.BRAND_KIT, { connection: redisConnection });
const baselineQueue = new Queue(QUEUE_NAMES.BASELINE, { connection: redisConnection });

interface SyncJobData {
  storeId: string;
  platform?: string;
}

interface SyncResult {
  imported: number;
  errors: string[];
}

const EMPTY_RESULT: SyncResult = { imported: 0, errors: [] };

export const syncWorker = new Worker<SyncJobData>(
  QUEUE_NAMES.SYNC,
  async (job) => {
    const { storeId } = job.data;
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        shopDomain: true,
        platform: true,
        isActive: true,
        widgetPublicKey: true,
      },
    });
    if (!store?.isActive) {
      throw new Error(`Active store ${storeId} not found`);
    }
    const { shopDomain, platform } = store;

    if (platform !== "shopify") {
      console.log(`Sync for platform "${platform}" not yet implemented`);
      return;
    }

    console.log(`Starting full sync for store ${storeId} (${shopDomain})`);
    const adminClient = await getShopifyAdminClient(storeId);
    // Sync functions still accept a token while the bulk GraphQL migration is
    // completed. The refreshed client exposes only the current token to them.
    const accessToken = adminClient.getEncryptedAccessToken();
    const coreFailures: string[] = [];

    // 0. Sync shop metadata (name, address, currency, etc.)
    await job.updateProgress(5);
    try {
      await syncShopMetadata(shopDomain, accessToken, storeId, prisma);
      console.log(`Shop metadata synced for store ${storeId}`);
    } catch (err: any) {
      console.warn(`Shop metadata sync skipped: ${err.message}`);
    }

    // 1. Sync products
    await job.updateProgress(10);
    let productResult: SyncResult = EMPTY_RESULT;
    try {
      productResult = await syncAllProducts(shopDomain, accessToken, storeId, prisma);
      console.log(
        `Products synced: ${productResult.imported} imported, ${productResult.errors.length} errors`
      );
    } catch (err: any) {
      console.warn(`Products sync skipped: ${err.message}`);
      coreFailures.push(`products: ${err.message}`);
    }

    // 2. Sync customers
    await job.updateProgress(40);
    let customerResult: SyncResult = EMPTY_RESULT;
    try {
      customerResult = await syncAllCustomers(shopDomain, accessToken, storeId, prisma);
      console.log(
        `Customers synced: ${customerResult.imported} imported, ${customerResult.errors.length} errors`
      );
    } catch (err: any) {
      console.warn(`Customers sync skipped: ${err.message}`);
      coreFailures.push(`customers: ${err.message}`);
    }

    // 3. Sync orders (depends on customers being synced)
    await job.updateProgress(70);
    let orderResult: SyncResult = EMPTY_RESULT;
    try {
      orderResult = await syncAllOrders(shopDomain, accessToken, storeId, prisma);
      console.log(
        `Orders synced: ${orderResult.imported} imported, ${orderResult.errors.length} errors`
      );
    } catch (err: any) {
      console.warn(`Orders sync skipped: ${err.message}`);
      coreFailures.push(`orders: ${err.message}`);
    }

    // 4. Sync collections
    await job.updateProgress(85);
    let collectionResult: SyncResult = EMPTY_RESULT;
    try {
      collectionResult = await syncAllCollections(shopDomain, accessToken, storeId, prisma);
      console.log(
        `Collections synced: ${collectionResult.imported} imported, ${collectionResult.errors.length} errors`
      );
    } catch (err: any) {
      console.warn(`Collections sync skipped: ${err.message}`);
    }

    // 5. Register webhooks for incremental updates
    await job.updateProgress(90);
    const webhookBaseUrl = process.env["WEBHOOK_BASE_URL"];
    if (webhookBaseUrl) {
      try {
        const webhookResult = await registerWebhooks({ shopDomain, accessToken, webhookBaseUrl });
        console.log(
          `Webhooks registered: ${webhookResult.registered.length}, errors: ${webhookResult.errors.length}`
        );
      } catch (err: any) {
        console.warn(`Webhook registration skipped: ${err.message}`);
      }
      if (store.widgetPublicKey) {
        try {
          const pixel = await registerWebPixel({
            shopDomain,
            accessToken,
            endpoint: webhookBaseUrl,
            publishableKey: store.widgetPublicKey,
          });
          await prisma.store.update({
            where: { id: storeId },
            data: {
              webPixelId: pixel.id,
              webPixelStatus: "registered",
              webPixelError: null,
              webPixelCheckedAt: new Date(),
            },
          });
          console.log(`Shopify Web Pixel configured: ${pixel.id}`);
        } catch (err: any) {
          await prisma.store.update({
            where: { id: storeId },
            data: {
              webPixelStatus: "error",
              webPixelError: err.message,
              webPixelCheckedAt: new Date(),
            },
          });
          console.warn(`Shopify Web Pixel registration skipped: ${err.message}`);
        }
      } else {
        console.warn("Shopify Web Pixel registration skipped: store has no publishable key");
      }
    } else {
      console.warn("WEBHOOK_BASE_URL not set, skipping webhook registration");
    }

    // Never mark a partial onboarding sync as successful. A retry can safely
    // upsert the same Shopify IDs, while downstream intelligence must not run
    // against a store whose core commerce history failed to import.
    if (coreFailures.length > 0) {
      throw new Error(`Core Shopify sync failed (${coreFailures.join("; ")})`);
    }

    // 5. Update lastSyncAt
    await prisma.store.update({
      where: { id: storeId },
      data: { lastSyncAt: new Date() },
    });

    // Operator terminal: the first thing allo did on this store (post-connect).
    await logActivity({
      storeId,
      activityType: "store_scan",
      summary: `Scanned your store — ${customerResult.imported.toLocaleString("en-IN")} customers, ${orderResult.imported.toLocaleString("en-IN")} orders synced`,
      actionTaken: "synced",
    }).catch(() => {});

    // 6. Trigger RFM + LTV calculation (background data enrichment)
    await rfmQueue.add("rfm-after-sync", { storeId });
    console.log(`RFM calculation enqueued for store ${storeId}`);

    // 7. Queue product image processing for all synced products
    const allProducts = await prisma.product.findMany({
      where: { storeId },
      select: { id: true },
    });
    for (const p of allProducts) {
      await productImageQueue.add("product-image", { storeId, productId: p.id });
    }
    console.log(`Product image processing enqueued for ${allProducts.length} products`);

    // 8. Queue brand kit extraction
    await brandKitQueue.add("brand-kit", { storeId });
    console.log(`Brand kit extraction enqueued for store ${storeId}`);

    // 9. Queue baseline capture
    await baselineQueue.add("baseline", { storeId });
    console.log(`Baseline capture enqueued for store ${storeId}`);

    await job.updateProgress(100);
    console.log(`Full sync completed for store ${storeId}`);

    return {
      products: productResult,
      customers: customerResult,
      orders: orderResult,
      collections: collectionResult,
    };
  },
  // concurrency:2 lets two stores sync in parallel (was serial, so a big store
  // blocked the next onboarding). Kept modest + paired with a smaller per-page
  // upsert batch (see customers sync) so peak DB connections stay ~flat. Raise
  // both together only if the Prisma connection pool is sized for it.
  { connection: redisConnection, concurrency: 2 }
);

syncWorker.on("completed", (job) => {
  console.log(`Sync job ${job.id} completed`);
});

syncWorker.on("failed", (job, err) => {
  console.error(`Sync job ${job?.id} failed:`, err.message);
});
