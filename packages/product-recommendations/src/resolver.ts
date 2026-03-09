import { prisma } from "@allohq/database";
import type { ResolvedProduct } from "./types";

/**
 * Enrich product IDs with full product data for rendering.
 * Prefers ProcessedProductImage.brandBgUrl when available.
 */
export async function resolveProducts(
  storeId: string,
  productIds: string[],
): Promise<ResolvedProduct[]> {
  if (productIds.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, storeId },
    select: {
      id: true,
      title: true,
      price: true,
      compareAtPrice: true,
      imageUrl: true,
      handle: true,
      status: true,
      variants: {
        select: { inventory: true },
        take: 10,
      },
      processedImages: {
        select: { brandBgUrl: true },
        take: 1,
      },
    },
  });

  // Build lookup map preserving input order
  const productMap = new Map(products.map((p) => [p.id, p]));

  const results: ResolvedProduct[] = [];
  for (const id of productIds) {
    const p = productMap.get(id);
    if (!p) continue;

    const totalInventory = p.variants.reduce((sum, v) => sum + v.inventory, 0);
    const processedImageUrl = p.processedImages[0]?.brandBgUrl;

    results.push({
      productId: p.id,
      title: p.title,
      price: p.price,
      compareAtPrice: p.compareAtPrice ?? undefined,
      imageUrl: processedImageUrl ?? p.imageUrl ?? "",
      handle: p.handle ?? undefined,
      inStock: totalInventory > 0,
    });
  }

  return results;
}
