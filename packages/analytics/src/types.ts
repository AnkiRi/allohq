/** Attribution model types */
export type AttributionModel = "first_touch" | "last_touch" | "linear" | "time_decay";

/** Revenue attribution result for a source */
export interface AttributionResult {
  sourceType: "campaign" | "automation";
  sourceId: string;
  sourceName: string;
  channel: string;
  revenue: number;
  orderCount: number;
  attributionModel: AttributionModel;
}

/** Channel breakdown entry */
export interface ChannelRevenue {
  channel: string;
  revenue: number;
  orderCount: number;
  messageCount: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
}

/** AI vs manual campaign comparison */
export interface CampaignComparison {
  category: "ai_generated" | "manual";
  campaignCount: number;
  totalRecipients: number;
  avgOpenRate: number;
  avgClickRate: number;
  totalRevenue: number;
  avgRevenuePerCampaign: number;
}

/** Cohort analysis data */
export interface CohortData {
  cohortMonth: string; // YYYY-MM
  customerCount: number;
  periods: CohortPeriod[];
}

/** A single period within a cohort */
export interface CohortPeriod {
  periodIndex: number; // months since cohort start
  activeCustomers: number;
  revenue: number;
  retentionRate: number;
}

/** ROI calculation result */
export interface RoiMetrics {
  aiTokenCost: number;
  aiAttributedRevenue: number;
  roi: number; // (revenue - cost) / cost
  campaignsSent: number;
  automationsSent: number;
  period: string;
}

/** Revenue forecast data point */
export interface ForecastPoint {
  date: string;
  projected: number;
  lower: number;
  upper: number;
}

/** Revenue forecast result */
export interface RevenueForecast {
  forecast7d: ForecastPoint[];
  forecast30d: ForecastPoint[];
  forecast90d: ForecastPoint[];
  generatedAt: Date;
}

/** Period comparison result */
export interface PeriodComparison {
  metric: string;
  currentValue: number;
  previousValue: number;
  change: number;
  changePercent: number;
  currentPeriod: string;
  previousPeriod: string;
}

/** Export format options */
export type ExportFormat = "csv" | "json";
