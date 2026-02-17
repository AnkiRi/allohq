/** A tracked analytics event */
export interface AnalyticsEvent {
  id: string;
  name: string;
  customerId?: string;
  properties: Record<string, unknown>;
  timestamp: Date;
}

/** Revenue attribution for a campaign or automation */
export interface RevenueAttribution {
  sourceType: "campaign" | "automation" | "flow";
  sourceId: string;
  revenue: number;
  orderCount: number;
  attributionWindow: number;
}

/** Cohort analysis data */
export interface CohortData {
  cohortDate: Date;
  customerCount: number;
  periods: CohortPeriod[];
}

/** A single period within a cohort */
export interface CohortPeriod {
  periodIndex: number;
  activeCustomers: number;
  revenue: number;
  retentionRate: number;
}
