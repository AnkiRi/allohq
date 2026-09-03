// Types
export type {
  JourneyType,
  JourneyStatus,
  JourneyStep,
  JourneyDecision,
  JourneyStepInput,
  WorkflowNode,
  ChannelSelection,
  ToneStyle,
  ABTestVariable,
  ABTestResult,
  ABTestEvaluation,
} from "./types";

// Journey Engine
export {
  startJourney,
  executeJourneyStep,
  getActiveJourneys,
  getJourneyStats,
} from "./journey-engine";

// Channel Selection
export { selectChannel, getBestChannel } from "./channel-selector";

// Tone Adaptation
export { getTone, adaptTone, extractToneMetadata } from "./tone-adapter";

// Content Personalisation
export {
  getPersonalisationContext,
  personaliseContent,
} from "./content-personaliser";

// Silence Detection
export {
  checkSilence,
  suppressJourneyForSilence,
  checkGlobalSilence,
} from "./silence-detector";

// A/B Testing
export {
  createTest,
  assignVariant,
  recordResult,
  evaluateTest,
  concludeTest,
  listRunningTests,
} from "./ab-testing";
