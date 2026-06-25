import type { PrismaClient } from "@allohq/database";
import { ShopifyClient } from "../client";
import type { ShopifyCollection, ShopifyCollect, ShopifySyncResult } from "../types";

/**
 * Sync all collections (custom + smart) and their product associations from Shopify.
 * Uses cursor-based pagination via Link header.
 */
export async function syncAllCollections(
  shopDomain: string,
  accessToken: string,
  storeId: string,
  prisma: PrismaClient
): Promise<ShopifySyncResult> {
  const client = new ShopifyClient(shopDomain, accessToken);
  let imported = 0;
  const errors: string[] = [];

  // Sync custom collections
  const customResult = await syncCollectionType(client, "custom_collections", "custom", storeId, prisma);
  imported += customResult.imported;
  errors.push(...customResult.errors);

  // Sync smart collections
  const smartResult = await syncCollectionType(client, "smart_collections", "smart", storeId, prisma);
  imported += smartResult.imported;
  errors.push(...smartResult.errors);

  // Sync product-collection associations (collects)
  await syncCollects(client, storeId, prisma);

  return { imported, errors };
}

async function syncCollectionType(
  client: ShopifyClient,
  endpoint: string,
  collectionType: string,
  storeId: string,
  prisma: PrismaClient
): Promise<ShopifySyncResult> {
  let imported = 0;
  const errors: string[] = [];
  let pageInfo: string | undefined;

  do {
    const params: Record<string, string> = { limit: "250" };
    if (pageInfo) params.page_info = pageInfo;

    const response = await client.get<ShopifyCollection>(endpoint, params);

    // Bounded parallel chunks instead of one collection upsert at a time.
    const COLLECTION_CONCURRENCY = 25;
    for (let i = 0; i < response.data.length; i += COLLECTION_CONCURRENCY) {
      const chunk = response.data.slice(i, i + COLLECTION_CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(async (collection) => {
          await prisma.collection.upsert({
            where: {
              storeId_externalId: {
                storeId,
                externalId: String(collection.id),
              },
            },
            create: {
              storeId,
              externalId: String(collection.id),
              title: collection.title,
              handle: collection.handle,
              description: collection.body_html ?? undefined,
              imageUrl: collection.image?.src ?? null,
              sortOrder: collection.sort_order,
              collectionType,
              publishedAt: collection.published_at ? new Date(collection.published_at) : null,
            },
            update: {
              title: collection.title,
              handle: collection.handle,
              description: collection.body_html ?? undefined,
              imageUrl: collection.image?.src ?? null,
              sortOrder: collection.sort_order,
              collectionType,
              publishedAt: collection.published_at ? new Date(collection.published_at) : null,
            },
          });
          imported++;
        }),
      );
      results.forEach((r, j) => {
        if (r.status === "rejected") {
          const msg =
            r.reason instanceof Error ? r.reason.message : String(r.reason);
          errors.push(`Collection ${chunk[j]?.id}: ${msg}`);
        }
      });
    }

    pageInfo = response.nextPageInfo;
  } while (pageInfo);

  return { imported, errors };
}

async function syncCollects(
  client: ShopifyClient,
  storeId: string,
  prisma: PrismaClient
): Promise<void> {
  let pageInfo: string | undefined;

  do {
    const params: Record<string, string> = { limit: "250" };
    if (pageInfo) params.page_info = pageInfo;

    const response = await client.get<ShopifyCollect>("collects", params);

    // Bounded parallel chunks; individual collect errors skipped silently (as before).
    const COLLECT_CONCURRENCY = 15;
    for (let i = 0; i < response.data.length; i += COLLECT_CONCURRENCY) {
      const chunk = response.data.slice(i, i + COLLECT_CONCURRENCY);
      await Promise.allSettled(
        chunk.map(async (collect) => {
          // Find collection and product by external IDs
          const [collection, product] = await Promise.all([
            prisma.collection.findUnique({
              where: { storeId_externalId: { storeId, externalId: String(collect.collection_id) } },
              select: { id: true },
            }),
            prisma.product.findUnique({
              where: { storeId_externalId: { storeId, externalId: String(collect.product_id) } },
              select: { id: true },
            }),
          ]);

          if (!collection || !product) return;

          await prisma.collectionProduct.upsert({
            where: {
              collectionId_productId: {
                collectionId: collection.id,
                productId: product.id,
              },
            },
            create: {
              collectionId: collection.id,
              productId: product.id,
              position: collect.position,
            },
            update: {
              position: collect.position,
            },
          });
        }),
      );
    }

    pageInfo = response.nextPageInfo;
  } while (pageInfo);
}
