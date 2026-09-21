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
export type { OpportunityScanTelemetry } from "./opportunity-scanner";
export { opportunityFingerprint, opportunityJobId } from "./opportunity-dedupe";

// Campaign Factory
export { generateCampaignDraft, prepareCampaignDecision } from "./campaign-factory";

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

export type { VariantStats, TestResults, EvaluationOutcome } from "./ab-test-engine";

// A/B Test Evolver (Self-Optimizing Agent)
export { applyWinner, generateNextHypothesis, createFollowUpTest } from "./ab-test-evolver";

export type { Hypothesis } from "./ab-test-evolver";

// Copy Learner (Self-Optimizing Agent)
export { analyzeCopyPatterns, getWinningPatterns, generateCopyBrief } from "./copy-learner";

export type { PatternRanking } from "./copy-learner";

export { campaignApprovalChecksum } from "./approval-checksum";
export type { CampaignApprovalSnapshot } from "./approval-checksum";
export {
  automationActivationChecksum,
  loadAutomationActivationSnapshot,
} from "./automation-activation-checksum";
export type { AutomationActivationSnapshot } from "./automation-activation-checksum";
export {
  resolveCampaignAudience,
  streamCampaignAudience,
  resolveAutomationAudience,
  streamAutomationAudience,
  countAutomationAudience,
  AUDIENCE_EXCLUSION_REASONS,
  staticAudienceExclusion,
} from "./audience-resolver";
export type { AudienceStreamDecision, AudienceStreamSummary } from "./audience-resolver";
export {
  runCampaignAudienceResolution,
  completedAudienceRun,
  campaignPreparationProgress,
  pageApprovedAssignments,
  AudienceRunBusyError,
  CANDIDATE_DECISION,
} from "./audience-run";
export {
  materialiseMeasurementAssignments,
  materialiseAudienceEvaluation,
  materialiseAudienceDecisions,
  leftAloneActivitySummary,
  recordAudienceReadyActivity,
  recordAudienceNeedsAttentionActivity,
} from "./audience-run";
export type {
  AudienceRunInput,
  AudienceRunResult,
  AudienceRunStatus,
  AudienceRunProgress,
  AudienceRunState,
} from "./audience-run";
export {
  withCampaignAudienceSnapshot,
  withCampaignAudienceSnapshotCounts,
  campaignAudienceSnapshot,
} from "./audience-snapshot";
export type { CampaignAudienceSnapshot } from "./audience-snapshot";
export type { AudienceResolution, AudienceExclusionReason } from "./audience-resolver";
export { evaluateCampaignCandidate } from "./candidate-policy";
export type { CandidateDecision, CandidateState } from "./candidate-policy";
export { findBannedTerms } from "./content-policy";

// Benchmark Comparison
export { getBenchmarkComparison } from "./benchmark-comparison";

// Approval mechanics, shared by the API and the preparation worker. These
// lived in apps/api/src/lib and could not be reached from a worker, which is
// what kept campaign approval inside a request.
export { campaignApprovalClaimWhere, campaignDispatchFailureUpdate } from "./approval-claim";
export { buildHumanDecision } from "./human-decision";
export { ensureEmailVersion } from "./email-versions";
export { collectEmailAssetManifest } from "./email-asset-manifest";
export type { EmailAssetReceipt } from "./email-asset-manifest";
export {
  finalizeCampaignApproval,
  AudienceRunNotCompleteError,
  CampaignApprovalConflictError,
} from "./approval-finalize";
export type { FinalizeApprovalInput } from "./approval-finalize";
export type { CampaignPreparationRequest } from "./preparation-request";
