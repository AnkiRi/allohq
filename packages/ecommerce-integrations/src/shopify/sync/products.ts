import type { PrismaClient } from "@allohq/database";
import { ShopifyClient } from "../client";
import type { ShopifyProduct, ShopifySyncResult } from "../types";

/**
 * Sync all products (with variants) from Shopify to the database.
 * Uses cursor-based pagination via Link header.
 */
export async function syncAllProducts(
  shopDomain: string,
  accessToken: string,
  storeId: string,
  prisma: PrismaClient
): Promise<ShopifySyncResult> {
  const client = new ShopifyClient(shopDomain, accessToken);
  let imported = 0;
  const errors: string[] = [];
  let pageInfo: string | undefined;

  do {
    const params: Record<string, string> = { limit: "250" };
    if (pageInfo) params.page_info = pageInfo;

    const response = await client.get<ShopifyProduct>("products", params);

    // Bounded parallel chunks instead of one product (+ its variants) at a time.
    const PRODUCT_CONCURRENCY = 10;
    for (let i = 0; i < response.data.length; i += PRODUCT_CONCURRENCY) {
      const chunk = response.data.slice(i, i + PRODUCT_CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(async (product) => {
        const upserted = await prisma.product.upsert({
          where: {
            storeId_externalId: {
              storeId,
              externalId: String(product.id),
            },
          },
          create: {
            storeId,
            externalId: String(product.id),
            title: product.title,
            description: product.body_html ?? undefined,
            handle: product.handle,
            vendor: product.vendor,
            productType: product.product_type,
            imageUrl: product.image?.src ?? product.images[0]?.src ?? null,
            price: product.variants[0]
              ? parseFloat(product.variants[0].price)
              : 0,
            compareAtPrice: product.variants[0]?.compare_at_price
              ? parseFloat(product.variants[0].compare_at_price)
              : null,
            status: product.status,
          },
          update: {
            title: product.title,
            description: product.body_html ?? undefined,
            handle: product.handle,
            vendor: product.vendor,
            productType: product.product_type,
            imageUrl: product.image?.src ?? product.images[0]?.src ?? null,
            price: product.variants[0]
              ? parseFloat(product.variants[0].price)
              : 0,
            compareAtPrice: product.variants[0]?.compare_at_price
              ? parseFloat(product.variants[0].compare_at_price)
              : null,
            status: product.status,
          },
        });

        // Upsert variants
        for (const variant of product.variants) {
          await prisma.productVariant.upsert({
            where: {
              productId_externalId: {
                productId: upserted.id,
                externalId: String(variant.id),
              },
            },
            create: {
              productId: upserted.id,
              externalId: String(variant.id),
              title: variant.title,
              sku: variant.sku,
              price: parseFloat(variant.price),
              inventory: variant.inventory_quantity,
            },
            update: {
              title: variant.title,
              sku: variant.sku,
              price: parseFloat(variant.price),
              inventory: variant.inventory_quantity,
            },
          });
        }

        imported++;
        }),
      );
      results.forEach((r, j) => {
        if (r.status === "rejected") {
          const msg =
            r.reason instanceof Error ? r.reason.message : String(r.reason);
          errors.push(`Product ${chunk[j]?.id}: ${msg}`);
        }
      });
    }

    pageInfo = response.nextPageInfo;
  } while (pageInfo);

  return { imported, errors };
}
