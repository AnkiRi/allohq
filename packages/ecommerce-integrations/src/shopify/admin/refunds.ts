import { ShopifyClient } from "../client";
import type { ShopifyRefund } from "../types";

function unsupported(): never {
  throw new Error(
    "Refund mutation is not enabled; complete merchant approval and write_orders review first",
  );
}

export async function calculateRefund(
  _client: ShopifyClient,
  _orderId: number,
  _lineItems: Array<{ line_item_id: number; quantity: number }>,
): Promise<{ refund: ShopifyRefund }> {
  return unsupported();
}

export async function createRefund(
  _client: ShopifyClient,
  _orderId: number,
  _opts: {
    note?: string;
    notify?: boolean;
    lineItems?: Array<{ line_item_id: number; quantity: number }>;
    shipping?: { full_refund: boolean };
    currency?: string;
  },
): Promise<ShopifyRefund> {
  return unsupported();
}

export async function listRefunds(
  _client: ShopifyClient,
  _orderId: number,
): Promise<ShopifyRefund[]> {
  return unsupported();
}
