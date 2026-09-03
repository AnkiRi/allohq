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

// A/B Test Evolver (Self-Optimizing Agent)
export {
  applyWinner,
  generateNextHypothesis,
  createFollowUpTest,
} from "./ab-test-evolver";

export type { Hypothesis } from "./ab-test-evolver";

// Copy Learner (Self-Optimizing Agent)
export {
  analyzeCopyPatterns,
  getWinningPatterns,
  generateCopyBrief,
} from "./copy-learner";

export type { PatternRanking } from "./copy-learner";

export { campaignApprovalChecksum } from "./approval-checksum";
export type { CampaignApprovalSnapshot } from "./approval-checksum";
export { automationActivationChecksum, loadAutomationActivationSnapshot } from "./automation-activation-checksum";
export type { AutomationActivationSnapshot } from "./automation-activation-checksum";
export { resolveCampaignAudience, resolveAutomationAudience, AUDIENCE_EXCLUSION_REASONS } from "./audience-resolver";
export type { AudienceResolution, AudienceExclusionReason } from "./audience-resolver";

// Benchmark Comparison
export { getBenchmarkComparison } from "./benchmark-comparison";
