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

export { AI_MODELS, DEFAULT_MODEL, getModel, resolveModelChain } from "./policy";
export type { AIModelId, AITask, AIModel, ModelTier } from "./policy";

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

export type { AIProvider } from "./providers";

export { MODEL_COSTS, computeTokenCost } from "./costs";
export type { ModelCost } from "./costs";
