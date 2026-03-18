// Types
export type {
  OpportunityType,
  CampaignOpportunity,
  RevenueEstimate,
  CampaignDraft,
  CalendarEvent,
  CampaignPerformance,
} from "./types";

// Opportunity Scanner
export { scanOpportunities } from "./opportunity-scanner";

// Campaign Factory
export { generateCampaignDraft } from "./campaign-factory";

// Revenue Estimator
export { estimateRevenue } from "./revenue-estimator";

// Calendar Awareness
export { getUpcomingEvents, getCurrentSeason, isShoppingSeason } from "./calendar-awareness";

// Inventory Awareness
export { checkInventoryConflicts } from "./inventory-aware";

// Performance Learner
export { learnFromResults, getArchetypePerformance } from "./performance-learner";

// A/B Test Execution Engine
export {
  assignVariant,
  recordConversion,
  evaluateTest,
  getTestResults,
  getActiveTestForAutomation,
  getActiveTestForStore,
  listAllRunningTests,
} from "./ab-test-engine";

export type {
  VariantStats,
  TestResults,
  EvaluationOutcome,
} from "./ab-test-engine";
