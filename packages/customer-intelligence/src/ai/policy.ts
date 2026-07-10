import type { AIProvider } from "./providers";

// ---------------------------------------------------------------------------
// Routing policy: tasks → tiers → concrete (provider, model).
//
// The gateway expresses intent as a `task`. The policy maps that task to a
// `tier`, and each tier resolves to an ordered list of candidate models. The
// gateway walks that list and uses the first AVAILABLE provider — this is what
// makes routing degrade gracefully (see fallback notes below).
// ---------------------------------------------------------------------------

export type AIModelId =
  | "claude-sonnet-5"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001"
  | "gpt-4o-mini";

export type ModelTier = "premium" | "standard" | "economy";

/**
 * Task classes a caller can declare. Drives tier selection on OUTPUT STAKES:
 *  - reasoning / generation / analysis → frontier (customer-facing or qualitatively judged)
 *  - classification → economy (mechanical intent/label/parse — verifiable, low-stakes)
 */
export type AITask =
  | "reasoning"
  | "generation"
  | "analysis"
  | "classification";

export interface AIModel {
  id: AIModelId;
  provider: AIProvider;
  label: string;
  description: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  tier: ModelTier;
}

// NOTE: gpt-4o is deliberately NOT in this roster / the routing chains — its low
// 30k-TPM tier caused a prod 429 storm when it became the fallback. Sonnet 4.6 is
// the guaranteed-working backstop (your key has it) that every chain degrades to,
// so a missing Sonnet-5/Haiku-4.5 access can't fall through to a rate-limited model.
// New Claude prices are best-estimate — verify vs Anthropic pricing (display only).
export const AI_MODELS: AIModel[] = [
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "Claude Sonnet 5",
    description: "Best quality — Anthropic's most capable model for customer-facing copy",
    inputCostPerMillion: 3,
    outputCostPerMillion: 15,
    tier: "premium",
  },
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    label: "Claude Sonnet 4.6",
    description: "High quality — reliable backstop for generation and reasoning",
    inputCostPerMillion: 3,
    outputCostPerMillion: 15,
    tier: "standard",
  },
  {
    id: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    description: "Fast and affordable — great for high-volume, mechanical tasks",
    inputCostPerMillion: 1,
    outputCostPerMillion: 5,
    tier: "economy",
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    label: "GPT-4o Mini",
    description: "Fast and affordable — OpenAI economy option (200k TPM)",
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.6,
    tier: "economy",
  },
];

export const DEFAULT_MODEL: AIModelId = "claude-sonnet-5";

/**
 * The working default that every task chain ends with — Sonnet 4.6, which the
 * prod Anthropic key is known to have. Guarantees a viable model even if Sonnet 5
 * / Haiku 4.5 access is missing, WITHOUT falling through to a rate-limited model.
 */
export const WORKING_DEFAULT_MODEL: AIModelId = "claude-sonnet-4-6";

/**
 * task → tier. ROUTE ON OUTPUT STAKES, not surface difficulty: anything a customer
 * sees or a human judges qualitatively goes FRONTIER (premium) even when the prompt
 * looks easy — cheap-model quality loss on copy is invisible (no verification signal).
 * Only genuinely MECHANICAL / verifiable / internal work goes economy.
 */
export const TASK_TIER: Record<AITask, ModelTier> = {
  reasoning: "premium",       // planning / agentic / nuanced judgement
  generation: "premium",      // customer-facing copy (email/sms/brand voice) — qualitative
  analysis: "premium",        // brand-voice / customer-voice synthesis — feeds what customers see
  classification: "economy",  // intent/label detection, parsing — mechanical + verifiable
};

/**
 * Ordered preference of models per tier. Index 0 is the ideal pick for the
 * tier; the rest are graceful-degrade candidates. EVERY list ends with the
 * working default (Claude) so that, with OpenAI over quota / keyless, routing
 * still resolves a viable model instead of hard-failing.
 */
export const TIER_MODELS: Record<ModelTier, AIModelId[]> = {
  // Every list degrades to Sonnet 4.6 (works on the prod key) before any low-limit
  // model, so missing Sonnet-5/Haiku-4.5 access degrades gracefully, never 429s.
  premium: ["claude-sonnet-5", "claude-sonnet-4-6", "gpt-4o-mini"],
  standard: ["claude-sonnet-4-6", "gpt-4o-mini", "claude-sonnet-5"],
  economy: ["claude-haiku-4-5-20251001", "gpt-4o-mini", "claude-sonnet-4-6"],
};

/**
 * Per-model fallback chain, used when an EXPLICIT model is requested (no task).
 * Preserves the legacy FALLBACK_CHAIN behaviour from client.ts.
 */
export const FALLBACK_CHAIN: Record<AIModelId, AIModelId[]> = {
  "claude-sonnet-5": ["claude-sonnet-4-6", "gpt-4o-mini"],
  "claude-sonnet-4-6": ["gpt-4o-mini", "claude-haiku-4-5-20251001"],
  "claude-haiku-4-5-20251001": ["gpt-4o-mini", "claude-sonnet-4-6"],
  "gpt-4o-mini": ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
};

export function getModel(id: AIModelId): AIModel | undefined {
  return AI_MODELS.find((m) => m.id === id);
}

/**
 * Resolve the ordered list of models to attempt, given optional explicit model
 * and/or task. Resolution rules:
 *   1. explicit model  → [model, ...its fallback chain]
 *   2. task            → tier's ordered model list
 *   3. neither         → default model + its fallback chain
 * The result always contains the working default somewhere, guaranteeing a
 * viable candidate exists when at least one provider is configured.
 */
export function resolveModelChain(opts: {
  model?: AIModelId;
  task?: AITask;
}): AIModelId[] {
  // Only honour an explicit model we still recognise. A legacy/stored id (e.g. a
  // workspace default saved as gpt-4o before this change) falls through to
  // task/default routing instead of dead-ending on a model no longer in the roster.
  if (opts.model && getModel(opts.model)) {
    return dedupe([opts.model, ...(FALLBACK_CHAIN[opts.model] ?? [])]);
  }
  if (opts.task) {
    const tier = TASK_TIER[opts.task];
    return dedupe([...TIER_MODELS[tier], WORKING_DEFAULT_MODEL]);
  }
  return dedupe([DEFAULT_MODEL, ...(FALLBACK_CHAIN[DEFAULT_MODEL] ?? [])]);
}

function dedupe(ids: AIModelId[]): AIModelId[] {
  return [...new Set(ids)];
}
