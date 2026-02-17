/** RFM segment name classification */
export type RfmSegmentName =
  | "Champions"
  | "Loyal Customers"
  | "Potential Loyalists"
  | "New Customers"
  | "Can't Lose Them"
  | "At Risk"
  | "Hibernating"
  | "Lost";

/** Definition of a customer segment with scoring thresholds */
export interface SegmentDefinition {
  name: string;
  slug: string;
  description: string;
  rfmMin: number;
  rfmMax: number;
  color: string;
}

/** Raw order data for a single customer */
export interface CustomerOrderData {
  customerId: string;
  orders: {
    totalPrice: number;
    createdAt: Date;
  }[];
}

/** Computed RFM raw data for a single customer */
export interface RfmRawData {
  customerId: string;
  daysSinceLastOrder: number;
  orderCount: number;
  totalSpent: number;
  avgOrderValue: number;
  lastOrderAt: Date | null;
}

/** LTV calculation result for a single customer */
export interface LtvResult {
  customerId: string;
  historicalLtv: number;
  predictedLtv: number;
  avgOrderValue: number;
  purchaseFrequency: number;
  customerLifespan: number;
  churnProbability: number;
}
