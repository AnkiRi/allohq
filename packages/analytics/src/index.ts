// Types
export type {
  AttributionModel,
  AttributionResult,
  ChannelRevenue,
  CampaignComparison,
  CohortData,
  CohortPeriod,
  RoiMetrics,
  ForecastPoint,
  RevenueForecast,
  PeriodComparison,
  ExportFormat,
} from "./types";

// Revenue attribution
export { computeAttribution, compareAttributionModels } from "./revenue-attribution";

// Channel breakdown
export { getChannelBreakdown } from "./channel-breakdown";

// AI vs manual performance
export { compareAiVsManual } from "./ai-performance";

// Cohort tracker
export { getCohortAnalysis } from "./cohort-tracker";

// ROI calculator
export { calculateRoi } from "./roi-calculator";

// Export
export { exportToCsv, exportToJson } from "./export";
