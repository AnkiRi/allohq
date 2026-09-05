export {
  LifecycleStage,
  IntentState,
  SupportState,
  VipLevel,
} from "./types";

export type {
  ChannelPreference,
  SendWindow,
  FatigueChannelState,
  FatigueState,
  CustomerStateData,
  StateUpdateEvent,
  ReorderPrediction,
} from "./types";

export { classifyLifecycleStage } from "./lifecycle-classifier";
export { detectIntent } from "./intent-detector";
export { computeChannelPreference } from "./channel-preference";
export { computeFatigueState, isOverFatigueLimit } from "./fatigue-tracker";
export { predictReorderTiming } from "./reorder-predictor";
export { computeFullState, updateStateOnEvent, decayStaleStates } from "./state-engine";
export { computeChurnRiskEstimate, computeChurnProbability } from "./churn-prediction";
export type { ChurnSignals } from "./churn-prediction";
export { estimateChurnRisk } from "./churn-risk";
export type { ChurnRiskInput, ChurnRiskEstimate } from "./churn-risk";
export { computeLiftStats, varianceFromAggregates } from "./lift-stats";
export type { GroupStat, LiftStats } from "./lift-stats";

// Causal-data moat: control-group assignment
export {
  getOrCreateExperiment,
  assignArm,
  assignCohortArms,
  assignmentValue,
  campaignMeasurementPolicy,
} from "./experiments";
export type { Arm, CohortDefinition, MeasurementTier, CampaignMeasurementPolicy } from "./experiments";
export { upliftReadiness } from "./uplift-readiness";
export type { UpliftTrainingExample, UpliftReadinessTier } from "./uplift-readiness";
