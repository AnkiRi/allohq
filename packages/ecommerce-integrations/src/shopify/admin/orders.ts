import { ShopifyClient } from "../client";
import type { ShopifyOrderDetail } from "../types";

/**
 * Mutating order administration is intentionally not enabled for the
 * design-partner release. Joon requests read_orders, never write_orders, and
 * the customer-facing agent does not receive cancellation/refund tools.
 */
function unsupported(): never {
  throw new Error(
    "Order mutation is not enabled; complete merchant approval and write_orders review first",
  );
}

export async function getOrder(
  _client: ShopifyClient,
  _orderId: number,
): Promise<ShopifyOrderDetail> {
  return unsupported();
}

export async function cancelOrder(
  _client: ShopifyClient,
  _orderId: number,
  _opts?: {
    reason?: "customer" | "fraud" | "inventory" | "declined" | "other";
    email?: boolean;
    restock?: boolean;
  },
): Promise<ShopifyOrderDetail> {
  return unsupported();
}

export async function closeOrder(
  _client: ShopifyClient,
  _orderId: number,
): Promise<ShopifyOrderDetail> {
  return unsupported();
}

export async function addOrderNote(
  _client: ShopifyClient,
  _orderId: number,
  _note: string,
): Promise<void> {
  unsupported();
}
