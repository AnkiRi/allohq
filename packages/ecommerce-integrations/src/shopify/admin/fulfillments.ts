import { ShopifyClient } from "../client";
import type { ShopifyFulfillment } from "../types";

interface GraphqlFulfillment {
  id: string;
  status: string;
  trackingInfo: Array<{
    company: string | null;
    number: string | null;
    url: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

function numericId(gid: string): number {
  const value = Number(gid.split("/").pop());
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Unexpected Shopify GID: ${gid}`);
  }
  return value;
}

function toLegacy(
  orderId: number,
  fulfillment: GraphqlFulfillment,
): ShopifyFulfillment {
  const primary = fulfillment.trackingInfo[0];
  return {
    id: numericId(fulfillment.id),
    order_id: orderId,
    status: fulfillment.status.toLowerCase(),
    tracking_company: primary?.company ?? null,
    tracking_number: primary?.number ?? null,
    tracking_url: primary?.url ?? null,
    tracking_numbers: fulfillment.trackingInfo
      .map((tracking) => tracking.number)
      .filter((value): value is string => !!value),
    tracking_urls: fulfillment.trackingInfo
      .map((tracking) => tracking.url)
      .filter((value): value is string => !!value),
    created_at: fulfillment.createdAt,
    updated_at: fulfillment.updatedAt,
  };
}

export async function listFulfillments(
  client: ShopifyClient,
  orderId: number,
): Promise<ShopifyFulfillment[]> {
  const response = await client.graphql<{
    order: { fulfillments: GraphqlFulfillment[] } | null;
  }>(`
    query JoonOrderFulfillments($id: ID!) {
      order(id: $id) {
        fulfillments(first: 100) {
          id
          status
          trackingInfo(first: 10) { company number url }
          createdAt
          updatedAt
        }
      }
    }
  `, { id: `gid://shopify/Order/${orderId}` });
  return (response.order?.fulfillments ?? []).map((fulfillment) =>
    toLegacy(orderId, fulfillment),
  );
}

export async function getFulfillment(
  client: ShopifyClient,
  orderId: number,
  fulfillmentId: number,
): Promise<ShopifyFulfillment> {
  const fulfillments = await listFulfillments(client, orderId);
  const fulfillment = fulfillments.find((item) => item.id === fulfillmentId);
  if (!fulfillment) {
    throw new Error(`Shopify fulfillment ${fulfillmentId} not found`);
  }
  return fulfillment;
}

export async function getOrderTracking(
  client: ShopifyClient,
  orderId: number,
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
    fulfilled:
      fulfillments.length > 0 &&
      fulfillments.every((fulfillment) => fulfillment.status === "success"),
    fulfillments: fulfillments.map((fulfillment) => ({
      status: fulfillment.status,
      trackingCompany: fulfillment.tracking_company,
      trackingNumber: fulfillment.tracking_number,
      trackingUrl: fulfillment.tracking_url,
    })),
  };
}
