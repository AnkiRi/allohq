import { ShopifyClient } from "../client";
import type { ShopifyRefund } from "../types";

/**
 * Calculate a refund (dry-run) — get the suggested refund amounts.
 */
export async function calculateRefund(
  client: ShopifyClient,
  orderId: number,
  lineItems: Array<{ line_item_id: number; quantity: number }>
): Promise<{ refund: ShopifyRefund }> {
  return client.post<{ refund: ShopifyRefund }>(
    `orders/${orderId}/refunds/calculate`,
    {
      refund: {
        refund_line_items: lineItems.map((li) => ({
          line_item_id: li.line_item_id,
          quantity: li.quantity,
        })),
      },
    }
  );
}

/**
 * Create a refund for an order.
 * If no line items specified, refunds the full order.
 */
export async function createRefund(
  client: ShopifyClient,
  orderId: number,
  opts: {
    note?: string;
    notify?: boolean;
    lineItems?: Array<{ line_item_id: number; quantity: number }>;
    shipping?: { full_refund: boolean };
    currency?: string;
  }
): Promise<ShopifyRefund> {
  const body: Record<string, unknown> = {
    refund: {
      note: opts.note ?? "Refund issued via Allo agent",
      notify: opts.notify ?? true,
      ...(opts.lineItems ? {
        refund_line_items: opts.lineItems.map((li) => ({
          line_item_id: li.line_item_id,
          quantity: li.quantity,
        })),
      } : {}),
      ...(opts.shipping ? { shipping: opts.shipping } : {}),
      ...(opts.currency ? { currency: opts.currency } : {}),
    },
  };

  const res = await client.post<{ refund: ShopifyRefund }>(
    `orders/${orderId}/refunds`,
    body
  );
  return res.refund;
}

/**
 * List all refunds for an order.
 */
export async function listRefunds(
  client: ShopifyClient,
  orderId: number
): Promise<ShopifyRefund[]> {
  const res = await client.get<ShopifyRefund>(`orders/${orderId}/refunds`);
  return res.data;
}
