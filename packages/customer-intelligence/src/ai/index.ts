// Gateway entry point + legacy-compatible surface
export { complete } from "./gateway";
export type { CompletionRequest, CompletionResult } from "./gateway";

// Model catalog + routing policy
export { AI_MODELS, DEFAULT_MODEL, getModel, resolveModelChain } from "./policy";
export type { AIModelId, AITask, AIModel, ModelTier } from "./policy";

// Merchant-configurable model harness
export {
  AI_WORKLOADS,
  DEFAULT_MODEL_HARNESS,
  normalizeModelHarness,
  resolveHarnessRoute,
  describeHarness,
} from "./model-harness";
export type {
  AIWorkload,
  ModelHarnessMode,
  ModelRoute,
  ModelHarnessConfig,
  ResolvedModelRoute,
} from "./model-harness";

// Provider adapter layer
export { getProvider } from "./providers";
export type { AIProvider, LlmProvider, ProviderRequest, ProviderResult } from "./providers";

// Single source of truth for model costs
export { MODEL_COSTS, computeTokenCost } from "./costs";
export type { ModelCost } from "./costs";
