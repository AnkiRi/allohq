import { ShopifyClient } from "../client";
import type { ShopifyFulfillment } from "../types";

/**
 * List fulfillments for an order (tracking info, status, etc.)
 */
export async function listFulfillments(
  client: ShopifyClient,
  orderId: number
): Promise<ShopifyFulfillment[]> {
  const res = await client.get<ShopifyFulfillment>(
    `orders/${orderId}/fulfillments`
  );
  return res.data;
}

/**
 * Get a specific fulfillment by ID.
 */
export async function getFulfillment(
  client: ShopifyClient,
  orderId: number,
  fulfillmentId: number
): Promise<ShopifyFulfillment> {
  return client.getSingle<ShopifyFulfillment>(
    `orders/${orderId}/fulfillments/${fulfillmentId}`
  );
}

/**
 * Get tracking info summary for an order.
 * Aggregates tracking from all fulfillments.
 */
export async function getOrderTracking(
  client: ShopifyClient,
  orderId: number
): Promise<{
  fulfilled: boolean;
  fulfillments: Array<{
    status: string;
    trackingCompany: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
  }>;
}> {
  const fulfillments = await listFulfillments(client, orderId);

  return {
    fulfilled: fulfillments.length > 0 && fulfillments.every((f) => f.status === "success"),
    fulfillments: fulfillments.map((f) => ({
      status: f.status,
      trackingCompany: f.tracking_company,
      trackingNumber: f.tracking_number,
      trackingUrl: f.tracking_url,
    })),
  };
}
