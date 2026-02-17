import type { CustomerOrderData, LtvResult } from "../types";

/**
 * Calculate lifetime value for a single customer.
 * Returns null if the customer has no orders.
 */
export function calculateCustomerLtv(
  customer: CustomerOrderData,
  now: Date = new Date()
): LtvResult | null {
  if (customer.orders.length === 0) return null;

  const sortedOrders = [...customer.orders].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  const totalSpent = sortedOrders.reduce((sum, o) => sum + o.totalPrice, 0);
  const avgOrderValue = totalSpent / sortedOrders.length;
  const firstOrder = sortedOrders[0]!.createdAt;
  const lastOrder = sortedOrders[sortedOrders.length - 1]!.createdAt;
  const lifespanMonths = Math.max(
    1,
    (now.getTime() - firstOrder.getTime()) / (1000 * 60 * 60 * 24 * 30)
  );
  const purchaseFrequency = sortedOrders.length / lifespanMonths;
  const daysSinceLastOrder =
    (now.getTime() - lastOrder.getTime()) / (1000 * 60 * 60 * 24);
  // Simple churn probability: higher if longer since last order
  const churnProbability = Math.min(1, daysSinceLastOrder / 180);
  // Simple predicted LTV: AOV * frequency * expected remaining months
  const expectedRemainingMonths = Math.max(0, 12 * (1 - churnProbability));
  const predictedLtv = totalSpent + avgOrderValue * purchaseFrequency * expectedRemainingMonths;

  return {
    customerId: customer.customerId,
    historicalLtv: totalSpent,
    predictedLtv,
    avgOrderValue,
    purchaseFrequency,
    customerLifespan: lifespanMonths,
    churnProbability,
  };
}
