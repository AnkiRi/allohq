import type { EmailBlock, ProductData } from "@allohq/email-builder";

/**
 * Resolve the store products a set of blocks refers to.
 *
 * Delivery builds this map and hands it to the renderer, which prefers it over
 * anything sitting on the block. Studio preview did NOT build it, so preview
 * fell back to the block's own props — and the two disagreed: a merchant could
 * approve an email showing one product image and Joon would send another.
 *
 * Same query, same shape, one helper, so preview and delivery cannot drift.
 */
export async function resolveBlockProducts(
  prisma: { product: { findMany: (args: any) => Promise<any[]> } },
  blocks: EmailBlock[],
  storeId?: string,
): Promise<Record<string, ProductData>> {
  const productIds: string[] = [];
  const walk = (list: EmailBlock[]) => {
    for (const block of list) {
      if (block.type === "product" && block.props.productId) productIds.push(block.props.productId);
      if (block.type === "product_grid") productIds.push(...block.props.productIds);
      if (block.type === "columns") walk(block.props.columns.flat());
    }
  };
  walk(blocks);
  if (!productIds.length) return {};

  const products = await prisma.product.findMany({
    // Scoped to the store when one is known, so a preview can never reach a
    // product from another tenant by id.
    where: { id: { in: [...new Set(productIds)] }, ...(storeId ? { storeId } : {}) },
  });

  const map: Record<string, ProductData> = {};
  for (const product of products) {
    map[product.id] = {
      id: product.id,
      title: product.title,
      description: product.description ?? undefined,
      imageUrl: product.imageUrl ?? undefined,
      price: product.price,
      compareAtPrice: product.compareAtPrice ?? undefined,
      handle: product.handle,
    };
  }
  return map;
}
