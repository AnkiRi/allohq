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

  if (config.type === "freeShipping") {
    throw new Error("Free-shipping signup incentives are not supported yet");
  }

  if (config.discountType === "percentage") {
    const cap = await prisma.guardrail.findFirst({
      where: { storeId, ruleType: "max_discount", isActive: true },
      orderBy: { createdAt: "desc" },
      select: { ruleValue: true },
    });
    const maximum = (cap?.ruleValue as { maxPercent?: number } | null)?.maxPercent;
    if (typeof maximum === "number" && (config.discountValue ?? 10) > maximum) {
      throw new Error(`Signup incentive exceeds the merchant's ${maximum}% discount guardrail`);
    }
  }

  const client = await shopify.getShopifyAdminClient(store.id);
  const code = config.code ?? generateCode();

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
