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
  | "claude-sonnet-4-6"
  | "gpt-4o"
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

export const AI_MODELS: AIModel[] = [
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    label: "Claude Sonnet 4.6",
    description: "Best quality — Anthropic's most capable model for creative content",
    inputCostPerMillion: 3,
    outputCostPerMillion: 15,
    tier: "premium",
  },
  {
    id: "gpt-4o",
    provider: "openai",
    label: "GPT-4o",
    description: "High quality — OpenAI's flagship model",
    inputCostPerMillion: 2.5,
    outputCostPerMillion: 10,
    tier: "standard",
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    label: "GPT-4o Mini",
    description: "Fast and affordable — good for quick iterations",
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.6,
    tier: "economy",
  },
];

export const DEFAULT_MODEL: AIModelId = "claude-sonnet-4-6";

/**
 * The working default provider. The OpenAI key is at quota (429), so Claude is
 * the reliable backstop — it appears in every degrade path.
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
  // economy wants the cheap OpenAI model first, then falls through to Claude
  // (the only currently-working provider) rather than failing.
  economy: ["gpt-4o-mini", "gpt-4o", "claude-sonnet-4-6"],
  standard: ["gpt-4o", "claude-sonnet-4-6", "gpt-4o-mini"],
  premium: ["claude-sonnet-4-6", "gpt-4o", "gpt-4o-mini"],
};

/**
 * Per-model fallback chain, used when an EXPLICIT model is requested (no task).
 * Preserves the legacy FALLBACK_CHAIN behaviour from client.ts.
 */
export const FALLBACK_CHAIN: Record<AIModelId, AIModelId[]> = {
  "claude-sonnet-4-6": ["gpt-4o", "gpt-4o-mini"],
  "gpt-4o": ["claude-sonnet-4-6", "gpt-4o-mini"],
  "gpt-4o-mini": ["gpt-4o", "claude-sonnet-4-6"],
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
  if (opts.model) {
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
