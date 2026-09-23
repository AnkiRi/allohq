import type { EmailBlock, ProductData } from "@allohq/email-builder";

/**
 * Resolve the store data a set of blocks refers to: products by id, and the
 * contents of any bound collection.
 *
 * Delivery builds this and hands it to the renderer, which prefers it over
 * anything sitting on the block. Studio preview did NOT, so preview fell back
 * to the block's own props and the two disagreed — a merchant could approve an
 * email showing one product image and Joon would send another.
 *
 * One helper, one query shape, called by preview, the approval snapshot and
 * delivery, so they cannot drift.
 */

type PrismaLike = {
  product: { findMany: (args: any) => Promise<any[]> };
  collectionProduct?: { findMany: (args: any) => Promise<any[]> };
};

export type ResolvedBlockData = {
  products: Record<string, ProductData>;
  /** Products of each bound collection, keyed by collection id. */
  collections: Record<string, ProductData[]>;
};

/** Default number of a collection's products a grid shows. */
export const DEFAULT_COLLECTION_LIMIT = 6;

function toProductData(product: any): ProductData {
  return {
    id: product.id,
    title: product.title,
    description: product.description ?? undefined,
    imageUrl: product.imageUrl ?? undefined,
    price: product.price,
    compareAtPrice: product.compareAtPrice ?? undefined,
    handle: product.handle,
  };
}

function collectReferences(blocks: EmailBlock[]) {
  const productIds: string[] = [];
  const collectionIds: string[] = [];
  const limits = new Map<string, number>();
  const walk = (list: EmailBlock[]) => {
    for (const block of list) {
      if (block.type === "product" && block.props.productId) productIds.push(block.props.productId);
      if (block.type === "product_grid") {
        productIds.push(...block.props.productIds);
        if (block.props.collectionId) {
          collectionIds.push(block.props.collectionId);
          limits.set(
            block.props.collectionId,
            Math.max(limits.get(block.props.collectionId) ?? 0, block.props.collectionLimit ?? DEFAULT_COLLECTION_LIMIT),
          );
        }
      }
      if (block.type === "columns") walk(block.props.columns.flat());
    }
  };
  walk(blocks);
  return { productIds: [...new Set(productIds)], collectionIds: [...new Set(collectionIds)], limits };
}

export async function resolveBlockData(
  prisma: PrismaLike,
  blocks: EmailBlock[],
  storeId?: string,
): Promise<ResolvedBlockData> {
  const { productIds, collectionIds, limits } = collectReferences(blocks);
  const products: Record<string, ProductData> = {};
  const collections: Record<string, ProductData[]> = {};

  if (productIds.length) {
    const rows = await prisma.product.findMany({
      // Scoped to the store when one is known, so a preview can never reach a
      // product belonging to another tenant by guessing an id.
      where: { id: { in: productIds }, ...(storeId ? { storeId } : {}) },
    });
    for (const row of rows) products[row.id] = toProductData(row);
  }

  if (collectionIds.length && prisma.collectionProduct) {
    const memberships = await prisma.collectionProduct.findMany({
      where: {
        collectionId: { in: collectionIds },
        ...(storeId ? { collection: { storeId } } : {}),
      },
      include: { product: true },
      orderBy: [{ collectionId: "asc" }, { position: "asc" }],
    });
    for (const membership of memberships) {
      if (!membership.product) continue;
      const bucket = (collections[membership.collectionId] ??= []);
      const limit = limits.get(membership.collectionId) ?? DEFAULT_COLLECTION_LIMIT;
      if (bucket.length >= limit) continue;
      const data = toProductData(membership.product);
      bucket.push(data);
      if (!products[data.id]) products[data.id] = data;
    }
    // A collection that resolved to nothing still gets a key, so callers can
    // tell "empty collection" from "never looked".
    for (const id of collectionIds) collections[id] ??= [];
  }

  return { products, collections };
}

/** Back-compat shim for callers that only need products. */
export async function resolveBlockProducts(
  prisma: PrismaLike,
  blocks: EmailBlock[],
  storeId?: string,
): Promise<Record<string, ProductData>> {
  return (await resolveBlockData(prisma, blocks, storeId)).products;
}
