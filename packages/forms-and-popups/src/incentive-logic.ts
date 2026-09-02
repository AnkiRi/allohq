import { prisma } from "@allohq/database";
import { shopify } from "@allohq/ecommerce-integrations";
import type { IncentiveConfig } from "./types";

/**
 * Generate a unique discount code.
 */
function generateCode(prefix: string = "ALLO"): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${code}`;
}

/**
 * Create an incentive discount code via Shopify and return the code.
 * Called when a form with incentive config receives a submission.
 */
export async function deliverIncentive(
  storeId: string,
  config: IncentiveConfig
): Promise<{ code: string; type: string } | null> {
  if (!config || (!config.discountType && config.type !== "freeShipping")) {
    return null;
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true },
  });

  if (!store) return null;

  const client = await shopify.getShopifyAdminClient(store.id);
  const code = config.code ?? generateCode();

  if (config.type === "freeShipping") {
    // Free shipping uses a 0% discount with free shipping flag
    // For now, create a percentage discount as a placeholder
    await shopify.createDiscount(client, {
      code,
      valueType: "percentage",
      value: 0,
      title: `Joon Signup - Free Shipping - ${code}`,
      oncePerCustomer: true,
    });
    return { code, type: "freeShipping" };
  }

  // Percentage or fixed discount
  await shopify.createDiscount(client, {
    code,
    valueType: config.discountType ?? "percentage",
    value: config.discountValue ?? 10,
    title: `Joon Signup - ${code}`,
    oncePerCustomer: true,
  });

  return { code, type: config.type };
}
