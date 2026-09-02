import type { PrismaClient } from "@allohq/database";
import { ShopifyClient } from "../client";
import type { ShopifySyncResult } from "../types";

interface GraphqlCollection {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  sortOrder: string;
  image: { url: string } | null;
  products: { nodes: Array<{ id: string }> };
}

function legacyId(gid: string): string {
  const value = gid.split("/").pop();
  if (!value) throw new Error(`Invalid Shopify GID: ${gid}`);
  return value;
}

/** Sync collections and membership exclusively through Admin GraphQL. */
export async function syncAllCollections(
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
      collections: {
        nodes: GraphqlCollection[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await client.graphql(`
      query JoonCollections($after: String) {
        collections(first: 50, after: $after) {
          nodes {
            id
            title
            handle
            descriptionHtml
            sortOrder
            image { url }
            products(first: 250) { nodes { id } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, { after: cursor });

    const collections = response.collections.nodes;
    const concurrency = 12;
    for (let i = 0; i < collections.length; i += concurrency) {
      const chunk = collections.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        chunk.map(async (collection) => {
          const upserted = await prisma.collection.upsert({
            where: {
              storeId_externalId: {
                storeId,
                externalId: legacyId(collection.id),
              },
            },
            create: {
              storeId,
              externalId: legacyId(collection.id),
              title: collection.title,
              handle: collection.handle,
              description: collection.descriptionHtml || undefined,
              imageUrl: collection.image?.url ?? null,
              sortOrder: collection.sortOrder.toLowerCase(),
              collectionType: "shopify",
            },
            update: {
              title: collection.title,
              handle: collection.handle,
              description: collection.descriptionHtml || undefined,
              imageUrl: collection.image?.url ?? null,
              sortOrder: collection.sortOrder.toLowerCase(),
              collectionType: "shopify",
            },
          });

          await Promise.all(
            collection.products.nodes.map(async (productNode, position) => {
              const product = await prisma.product.findUnique({
                where: {
                  storeId_externalId: {
                    storeId,
                    externalId: legacyId(productNode.id),
                  },
                },
                select: { id: true },
              });
              if (!product) return;
              await prisma.collectionProduct.upsert({
                where: {
                  collectionId_productId: {
                    collectionId: upserted.id,
                    productId: product.id,
                  },
                },
                create: {
                  collectionId: upserted.id,
                  productId: product.id,
                  position,
                },
                update: { position },
              });
            }),
          );
          imported++;
        }),
      );
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          errors.push(
            `Collection ${chunk[index]?.id}: ${
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
            }`,
          );
        }
      });
    }

    cursor = response.collections.pageInfo.hasNextPage
      ? response.collections.pageInfo.endCursor
      : null;
  } while (cursor);

  return { imported, errors };
}
