import type { CustomerOrderData, RfmRawData } from "../types";

/**
 * Compute raw RFM data (recency, frequency, monetary) from customer order data.
 */
export function computeRfmRawData(
  customers: CustomerOrderData[],
  now: Date = new Date()
): RfmRawData[] {
  return customers.map((c) => {
    const orderDates = c.orders.map((o) => o.createdAt.getTime());
    const lastOrderAt = orderDates.length > 0 ? new Date(Math.max(...orderDates)) : null;
    const daysSinceLastOrder = lastOrderAt
      ? (now.getTime() - lastOrderAt.getTime()) / (1000 * 60 * 60 * 24)
      : 9999;
    const orderCount = c.orders.length;
    const totalSpent = c.orders.reduce((sum, o) => sum + o.totalPrice, 0);
    const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0;

    return {
      customerId: c.customerId,
      daysSinceLastOrder,
      orderCount,
      totalSpent,
      avgOrderValue,
      lastOrderAt,
    };
  });
}
