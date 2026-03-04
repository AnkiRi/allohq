import { ShopifyClient } from "../client";
import type { ShopifyPriceRule, ShopifyDiscountCode } from "../types";

/**
 * Create a Shopify price rule + discount code.
 * This makes the discount usable at checkout.
 */
export async function createDiscount(
  client: ShopifyClient,
  opts: {
    code: string;
    valueType: "percentage" | "fixed_amount";
    value: number; // positive number — e.g. 20 for 20% or 10 for $10 off
    title?: string;
    usageLimit?: number;
    oncePerCustomer?: boolean;
    startsAt?: Date;
    endsAt?: Date;
  }
): Promise<{ priceRule: ShopifyPriceRule; discountCode: ShopifyDiscountCode }> {
  // Shopify expects negative values for discounts
  const shopifyValue = opts.valueType === "percentage"
    ? `-${opts.value}`
    : `-${opts.value}.00`;

  // Step 1: Create price rule
  const priceRuleRes = await client.post<{ price_rule: ShopifyPriceRule }>(
    "price_rules",
    {
      price_rule: {
        title: opts.title ?? `Allo-${opts.code}`,
        target_type: "line_item",
        target_selection: "all",
        allocation_method: "across",
        value_type: opts.valueType,
        value: shopifyValue,
        customer_selection: "all",
        once_per_customer: opts.oncePerCustomer ?? true,
        usage_limit: opts.usageLimit ?? null,
        starts_at: (opts.startsAt ?? new Date()).toISOString(),
        ends_at: opts.endsAt?.toISOString() ?? null,
      },
    }
  );

  const priceRule = priceRuleRes.price_rule;

  // Step 2: Create discount code under that price rule
  const discountRes = await client.post<{ discount_code: ShopifyDiscountCode }>(
    `price_rules/${priceRule.id}/discount_codes`,
    {
      discount_code: {
        code: opts.code,
      },
    }
  );

  return {
    priceRule,
    discountCode: discountRes.discount_code,
  };
}

/**
 * Delete a discount by removing its price rule (cascades to codes).
 */
export async function deleteDiscount(
  client: ShopifyClient,
  priceRuleId: number
): Promise<void> {
  await client.delete(`price_rules/${priceRuleId}`);
}

/**
 * Look up a discount code's usage stats.
 */
export async function getDiscountCode(
  client: ShopifyClient,
  priceRuleId: number,
  discountCodeId: number
): Promise<ShopifyDiscountCode> {
  return client.getSingle<ShopifyDiscountCode>(
    `price_rules/${priceRuleId}/discount_codes/${discountCodeId}`
  );
}
