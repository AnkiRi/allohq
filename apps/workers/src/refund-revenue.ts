export type ShopifyOrderRevenuePayload = {
  total_price?: string | number;
  refunds?: unknown;
};

/**
 * Count the order total unless the order is cancelled. Cancellation is handled
 * by the webhook worker before this function runs. Refund and fulfilment data
 * may be incomplete when a merchant uses an external OMS/WMS, so neither
 * changes attributed revenue under the locked v1 rule.
 */
export function calculateCountedOrderRevenue(
  payload: ShopifyOrderRevenuePayload,
  fallbackTotal: number,
): number {
  const gross = Number(payload.total_price ?? fallbackTotal);
  return Math.max(0, Number.isFinite(gross) ? gross : fallbackTotal);
}
