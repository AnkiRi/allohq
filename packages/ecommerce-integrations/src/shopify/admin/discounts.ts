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
  const mutation = `
    mutation CreateJoonDiscount($input: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $input) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              startsAt
              endsAt
              codes(first: 1) {
                nodes {
                  id
                  code
                }
              }
            }
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const value =
    opts.valueType === "percentage"
      ? { percentage: opts.value / 100 }
      : {
          discountAmount: {
            amount: opts.value.toFixed(2),
            appliesOnEachItem: false,
          },
        };
  const response = await client.graphql<{
    discountCodeBasicCreate: {
      codeDiscountNode: {
        id: string;
        codeDiscount: {
          title: string;
          startsAt: string;
          endsAt: string | null;
          codes: { nodes: Array<{ id: string; code: string }> };
        };
      } | null;
      userErrors: Array<{
        field?: string[];
        message: string;
        code?: string;
      }>;
    };
  }>(mutation, {
    input: {
      title: opts.title ?? `Joon: ${opts.code}`,
      code: opts.code,
      startsAt: (opts.startsAt ?? new Date()).toISOString(),
      endsAt: opts.endsAt?.toISOString() ?? null,
      // customerSelection remains supported in 2026-07 and avoids ambiguity in
      // the new enum-backed `context.all` input across API revisions.
      customerSelection: { all: true },
      customerGets: {
        value,
        items: { all: true },
      },
      appliesOncePerCustomer: opts.oncePerCustomer ?? true,
      usageLimit: opts.usageLimit ?? null,
    },
  });

  const payload = response.discountCodeBasicCreate;
  if (payload.userErrors.length) {
    throw new Error(
      `Shopify rejected discount: ${payload.userErrors
        .map((error) => `${error.field?.join(".") ?? "input"}: ${error.message}`)
        .join("; ")}`,
    );
  }
  const node = payload.codeDiscountNode;
  const redeemCode = node?.codeDiscount.codes.nodes[0];
  if (!node || !redeemCode) {
    throw new Error("Shopify created no redeemable discount code");
  }

  const numericId = (gid: string) => {
    const value = Number(gid.split("/").pop());
    if (!Number.isSafeInteger(value)) {
      throw new Error(`Unexpected Shopify GID: ${gid}`);
    }
    return value;
  };
  const createdAt = new Date().toISOString();
  const priceRule: ShopifyPriceRule = {
    id: numericId(node.id),
    title: node.codeDiscount.title,
    target_type: "line_item",
    target_selection: "all",
    allocation_method: "across",
    value_type: opts.valueType,
    value: String(-opts.value),
    once_per_customer: opts.oncePerCustomer ?? true,
    usage_limit: opts.usageLimit ?? null,
    starts_at: node.codeDiscount.startsAt,
    ends_at: node.codeDiscount.endsAt,
    created_at: createdAt,
    updated_at: createdAt,
  };
  const discountCode: ShopifyDiscountCode = {
    id: numericId(redeemCode.id),
    price_rule_id: priceRule.id,
    code: redeemCode.code,
    usage_count: 0,
    created_at: createdAt,
    updated_at: createdAt,
  };

  return { priceRule, discountCode };
}

/**
 * Delete a discount by removing its price rule (cascades to codes).
 */
export async function deleteDiscount(
  client: ShopifyClient,
  priceRuleId: number
): Promise<void> {
  const response = await client.graphql<{
    discountCodeDelete: {
      deletedCodeDiscountId: string | null;
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  }>(`
    mutation DeleteJoonDiscount($id: ID!) {
      discountCodeDelete(id: $id) {
        deletedCodeDiscountId
        userErrors { field message }
      }
    }
  `, { id: `gid://shopify/DiscountCodeNode/${priceRuleId}` });
  if (response.discountCodeDelete.userErrors.length) {
    throw new Error(
      response.discountCodeDelete.userErrors
        .map((error) => error.message)
        .join("; "),
    );
  }
}

/**
 * Look up a discount code's usage stats.
 */
export async function getDiscountCode(
  _client: ShopifyClient,
  _priceRuleId: number,
  _discountCodeId: number
): Promise<ShopifyDiscountCode> {
  throw new Error(
    "Direct discount-code lookup is not enabled; campaign attribution uses the stored code and order events",
  );
}
