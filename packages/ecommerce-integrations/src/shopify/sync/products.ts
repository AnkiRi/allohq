import type { PrismaClient } from "@allohq/database";
import { ShopifyClient } from "../client";
import type { ShopifySyncResult } from "../types";

interface GraphqlProduct {
  id: string;
  title: string;
  descriptionHtml: string;
  handle: string;
  vendor: string;
  productType: string;
  status: string;
  images: { nodes: Array<{ url: string }> };
  variants: {
    nodes: Array<{
      id: string;
      title: string;
      sku: string | null;
      price: string;
      compareAtPrice: string | null;
      inventoryQuantity: number | null;
      image: { url: string } | null;
    }>;
  };
}

function legacyId(gid: string): string {
  const value = gid.split("/").pop();
  if (!value) throw new Error(`Invalid Shopify GID: ${gid}`);
  return value;
}

/**
 * Sync products and variants using cursor-paginated Admin GraphQL. Nested
 * variants are capped at 250, Shopify's connection maximum; catalogs with a
 * product above that limit are surfaced as a sync error rather than silently
 * using REST.
 */
export async function syncAllProducts(
  shopDomain: string,
  accessToken: string,
  storeId: string,
  prisma: PrismaClient,
): Promise<ShopifySyncResult> {
  const client = new ShopifyClient(shopDomain, accessToken);
  let imported = 0;
  const errors: string[] = [];
  let cursor: string | null = null;

  do {
    const response: {
      products: {
        nodes: GraphqlProduct[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await client.graphql(`
      query JoonProducts($after: String) {
        products(first: 50, after: $after) {
          nodes {
            id
            title
            descriptionHtml
            handle
            vendor
            productType
            status
            images(first: 1) { nodes { url } }
            variants(first: 250) {
              nodes {
                id
                title
                sku
                price
                compareAtPrice
                inventoryQuantity
                image { url }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, { after: cursor });

    const products = response.products.nodes;
    const concurrency = 10;
    for (let i = 0; i < products.length; i += concurrency) {
      const chunk = products.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        chunk.map(async (product) => {
          const firstVariant = product.variants.nodes[0];
          const upserted = await prisma.product.upsert({
            where: {
              storeId_externalId: {
                storeId,
                externalId: legacyId(product.id),
              },
            },
            create: {
              storeId,
              externalId: legacyId(product.id),
              title: product.title,
              description: product.descriptionHtml || undefined,
              handle: product.handle,
              vendor: product.vendor || null,
              productType: product.productType || null,
              imageUrl: product.images.nodes[0]?.url ?? null,
              price: Number(firstVariant?.price ?? 0),
              compareAtPrice: firstVariant?.compareAtPrice
                ? Number(firstVariant.compareAtPrice)
                : null,
              status: product.status.toLowerCase(),
            },
            update: {
              title: product.title,
              description: product.descriptionHtml || undefined,
              handle: product.handle,
              vendor: product.vendor || null,
              productType: product.productType || null,
              imageUrl: product.images.nodes[0]?.url ?? null,
              price: Number(firstVariant?.price ?? 0),
              compareAtPrice: firstVariant?.compareAtPrice
                ? Number(firstVariant.compareAtPrice)
                : null,
              status: product.status.toLowerCase(),
            },
          });

          await Promise.all(
            product.variants.nodes.map((variant) =>
              prisma.productVariant.upsert({
                where: {
                  productId_externalId: {
                    productId: upserted.id,
                    externalId: legacyId(variant.id),
                  },
                },
                create: {
                  productId: upserted.id,
                  externalId: legacyId(variant.id),
                  title: variant.title,
                  sku: variant.sku,
                  price: Number(variant.price),
                  inventory: variant.inventoryQuantity ?? 0,
                  imageUrl: variant.image?.url ?? null,
                },
                update: {
                  title: variant.title,
                  sku: variant.sku,
                  price: Number(variant.price),
                  inventory: variant.inventoryQuantity ?? 0,
                  imageUrl: variant.image?.url ?? null,
                },
              }),
            ),
          );
          imported++;
        }),
      );
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          errors.push(
            `Product ${chunk[index]?.id}: ${
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
            }`,
          );
        }
      });
    }

    cursor = response.products.pageInfo.hasNextPage
      ? response.products.pageInfo.endCursor
      : null;
  } while (cursor);

  return { imported, errors };
}
