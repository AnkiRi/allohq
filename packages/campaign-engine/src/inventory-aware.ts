import { prisma } from "@allohq/database";

interface InventoryConflict {
  productId: string;
  productTitle: string;
  currentStock: number;
  campaignName?: string;
  automationName?: string;
}

/**
 * Check for inventory conflicts: products in active campaigns/automations
 * that have low stock (< threshold).
 */
export async function checkInventoryConflicts(
  storeId: string,
  stockThreshold: number = 5,
): Promise<InventoryConflict[]> {
  // Get low-stock product variants
  const lowStockVariants = await prisma.productVariant.findMany({
    where: {
      product: { storeId, status: "active" },
      inventory: { lte: stockThreshold },
    },
    select: {
      productId: true,
      inventory: true,
      product: { select: { title: true } },
    },
  });

  if (lowStockVariants.length === 0) return [];

  const productIds = [...new Set(lowStockVariants.map((v) => v.productId))];

  // Check if any of these products are referenced in active campaigns
  const activeCampaigns = await prisma.campaign.findMany({
    where: {
      storeId,
      status: { in: ["draft", "scheduled"] },
    },
    select: {
      name: true,
      template: { select: { blocks: true } },
    },
  });

  const conflicts: InventoryConflict[] = [];

  for (const campaign of activeCampaigns) {
    const blocks = campaign.template.blocks as unknown as { type: string; props: Record<string, unknown> }[];
    for (const block of blocks) {
      if (block.type === "product" && productIds.includes(block.props.productId as string)) {
        const variant = lowStockVariants.find((v) => v.productId === block.props.productId);
        if (variant) {
          conflicts.push({
            productId: variant.productId,
            productTitle: variant.product.title,
            currentStock: variant.inventory,
            campaignName: campaign.name,
          });
        }
      }
      if (block.type === "product_grid") {
        const gridProductIds = block.props.productIds as string[];
        for (const pid of gridProductIds) {
          if (productIds.includes(pid)) {
            const variant = lowStockVariants.find((v) => v.productId === pid);
            if (variant) {
              conflicts.push({
                productId: variant.productId,
                productTitle: variant.product.title,
                currentStock: variant.inventory,
                campaignName: campaign.name,
              });
            }
          }
        }
      }
    }
  }

  return conflicts;
}
