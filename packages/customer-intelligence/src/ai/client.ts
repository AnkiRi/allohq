// ---------------------------------------------------------------------------
// client.ts — backwards-compatible facade over the model-orchestration gateway.
//
// All model calls now route through the single gateway (./gateway). This file
// only re-exports the canonical entry point + types so every existing caller
// (`import { complete } from "../ai"`) keeps working unchanged. The legacy
// `complete()` signature is preserved; the gateway adds the optional `task`
// concept on top of it.
// ---------------------------------------------------------------------------

export { complete } from "./gateway";
export type { CompletionRequest, CompletionResult } from "./gateway";

export { AI_MODELS, DEFAULT_MODEL } from "./policy";
export type { AIModelId, AITask, AIModel, ModelTier } from "./policy";

export type { AIProvider } from "./providers";

export { MODEL_COSTS, computeTokenCost } from "./costs";
export type { ModelCost } from "./costs";
