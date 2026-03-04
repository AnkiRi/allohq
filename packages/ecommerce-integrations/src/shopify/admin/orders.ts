import { ShopifyClient } from "../client";
import type { ShopifyOrderDetail } from "../types";

/**
 * Get full order details including fulfillments and refunds.
 */
export async function getOrder(
  client: ShopifyClient,
  orderId: number
): Promise<ShopifyOrderDetail> {
  return client.getSingle<ShopifyOrderDetail>(`orders/${orderId}`);
}

/**
 * Cancel an order in Shopify.
 * Only works if the order is unfulfilled.
 */
export async function cancelOrder(
  client: ShopifyClient,
  orderId: number,
  opts?: {
    reason?: "customer" | "fraud" | "inventory" | "declined" | "other";
    email?: boolean; // notify customer
    restock?: boolean;
  }
): Promise<ShopifyOrderDetail> {
  const res = await client.post<{ order: ShopifyOrderDetail }>(
    `orders/${orderId}/cancel`,
    {
      reason: opts?.reason ?? "other",
      email: opts?.email ?? true,
      restock: opts?.restock ?? true,
    }
  );
  return res.order;
}

/**
 * Close an order (mark as complete).
 */
export async function closeOrder(
  client: ShopifyClient,
  orderId: number
): Promise<ShopifyOrderDetail> {
  const res = await client.post<{ order: ShopifyOrderDetail }>(
    `orders/${orderId}/close`,
    {}
  );
  return res.order;
}

/**
 * Add a note to an order.
 */
export async function addOrderNote(
  client: ShopifyClient,
  orderId: number,
  note: string
): Promise<void> {
  await client.put(`orders/${orderId}`, {
    order: { id: orderId, note },
  });
}
