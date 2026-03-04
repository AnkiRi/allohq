import { prisma } from "@allohq/database";
import { shopify } from "@allohq/ecommerce-integrations";
const { ShopifyClient, createDiscount } = shopify;
import type { ToolDefinition } from "../types";

/**
 * Generate a random alphanumeric discount code.
 */
function generateCode(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = prefix ? prefix.toUpperCase() + "-" : "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Get a ShopifyClient for a store */
async function getShopifyClient(storeId: string): Promise<InstanceType<typeof ShopifyClient> | null> {
  const store = await prisma.store.findFirst({
    where: { id: storeId },
    select: { shopDomain: true, accessToken: true, platform: true },
  });
  if (!store || store.platform !== "shopify") return null;
  return new ShopifyClient(store.shopDomain, store.accessToken);
}

export const discountTools: ToolDefinition[] = [
  {
    name: "create_discount_code",
    description:
      "Create a real discount code in the Shopify store. Creates a price rule and discount code that customers can use at checkout. Returns the code to share.",
    parameters: {
      type: {
        type: "string",
        description: "Discount type: 'percentage' or 'fixed_amount'",
      },
      value: {
        type: "number",
        description: "Discount value (e.g. 20 for 20% or 10 for $10 off)",
      },
      prefix: {
        type: "string",
        description: "Optional code prefix (e.g. 'WINBACK', 'VIP')",
      },
      reason: {
        type: "string",
        description: "Why this discount is being created (for logging)",
      },
      expiresInDays: {
        type: "number",
        description: "Days until the discount expires (default: 30)",
      },
    },
    handler: async (params, ctx) => {
      const discountType = String(params.type ?? "percentage") as "percentage" | "fixed_amount";
      const value = Number(params.value ?? 10);
      const prefix = String(params.prefix ?? "ALLO");
      const reason = String(params.reason ?? "Agent-generated discount");
      const expiresInDays = Number(params.expiresInDays ?? 30);
      const code = generateCode(prefix);

      const client = await getShopifyClient(ctx.storeId);

      let shopifyResult: { priceRuleId?: number; discountCodeId?: number; createdInShopify: boolean } = {
        createdInShopify: false,
      };

      if (client) {
        try {
          const endsAt = new Date();
          endsAt.setDate(endsAt.getDate() + expiresInDays);

          const result = await createDiscount(client, {
            code,
            valueType: discountType,
            value,
            title: `Allo: ${reason}`,
            oncePerCustomer: true,
            endsAt,
          });

          shopifyResult = {
            priceRuleId: result.priceRule.id,
            discountCodeId: result.discountCode.id,
            createdInShopify: true,
          };
        } catch (err) {
          console.error("[create_discount_code] Shopify API error:", err);
          // Fall through — still log the action, just note Shopify creation failed
        }
      }

      // Log the discount creation as an agent action
      await prisma.agentAction.create({
        data: {
          storeId: ctx.storeId,
          agentType: "retention_strategist",
          actionType: "create_discount",
          input: { type: discountType, value, code, reason },
          output: { code, ...shopifyResult },
          status: shopifyResult.createdInShopify ? "completed" : "failed",
        },
      });

      if (!shopifyResult.createdInShopify) {
        return {
          success: false,
          code,
          message: `Could not create discount in Shopify (API error). The code ${code} was NOT created at checkout. Check Shopify API credentials and scopes.`,
        };
      }

      return {
        success: true,
        code,
        type: discountType,
        value,
        expiresInDays,
        description: discountType === "percentage" ? `${value}% off` : `$${value} off`,
        message: `Discount code **${code}** created in Shopify (${discountType === "percentage" ? value + "%" : "$" + value} off, expires in ${expiresInDays} days). Customers can use it at checkout.`,
      };
    },
  },
];
