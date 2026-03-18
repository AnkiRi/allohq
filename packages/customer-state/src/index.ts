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
export { computeChurnProbability } from "./churn-prediction";
export type { ChurnSignals } from "./churn-prediction";
