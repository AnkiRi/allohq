type RefundTransaction = {
  amount?: string | number;
  kind?: string;
  status?: string;
};

export type ShopifyOrderRevenuePayload = {
  total_price?: string | number;
  refunds?: Array<{ transactions?: RefundTransaction[] }>;
};

/** Shopify sends the cumulative refund history on orders/updated. */
export function calculateNetOrderRevenue(
  payload: ShopifyOrderRevenuePayload,
  fallbackTotal: number,
): number {
  const gross = Number(payload.total_price ?? fallbackTotal);
  const refunded = (payload.refunds ?? [])
    .flatMap((refund) => refund.transactions ?? [])
    .filter(
      (transaction) =>
        transaction.kind === "refund" &&
        transaction.status?.toLowerCase() !== "failure",
    )
    .reduce((sum, transaction) => {
      const amount = Number(transaction.amount ?? 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  return Math.max(0, (Number.isFinite(gross) ? gross : fallbackTotal) - refunded);
}
