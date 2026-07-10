// Gateway entry point + legacy-compatible surface
export { complete } from "./gateway";
export type { CompletionRequest, CompletionResult } from "./gateway";

// Model catalog + routing policy
export { AI_MODELS, DEFAULT_MODEL } from "./policy";
export type { AIModelId, AITask, AIModel, ModelTier } from "./policy";

// Provider adapter layer
export { getProvider } from "./providers";
export type { AIProvider, LlmProvider, ProviderRequest, ProviderResult } from "./providers";

// Single source of truth for model costs
export { MODEL_COSTS, computeTokenCost } from "./costs";
export type { ModelCost } from "./costs";

// Per-request LLM context (demo vs prod key selection)
export { llmRequestContext, isDemoLlmRequest } from "./request-context";
export type { LlmRequestContext } from "./request-context";
