// ---------------------------------------------------------------------------
// SINGLE SOURCE OF TRUTH for model cost data (USD per 1M tokens).
//
// This is the ONE place model pricing lives. Other packages/apps that need to
// compute token cost (dashboard token-usage panel, analytics ROI calculator)
// MUST import `MODEL_COSTS` / `computeTokenCost` from here instead of keeping
// their own duplicate copies.
// ---------------------------------------------------------------------------

export interface ModelCost {
  /** USD per 1,000,000 input tokens */
  input: number;
  /** USD per 1,000,000 output tokens */
  output: number;
}

/**
 * Cost per million tokens for each model id. Keyed by the raw model string we
 * persist in TokenUsage.model, so historical rows (e.g. dated Anthropic ids)
 * still resolve a price.
 */
export const MODEL_COSTS: Record<string, ModelCost> = {
  // Current roster (best-estimate Claude pricing — verify vs Anthropic pricing).
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  // Legacy ids kept so historical TokenUsage rows still resolve a price.
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "gpt-4o": { input: 2.5, output: 10 },
};

/**
 * Compute USD cost for a given token count against a model. Returns 0 for
 * unknown models (matches the previous behaviour of the duplicated copies).
 */
export function computeTokenCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const costs = MODEL_COSTS[model] ?? { input: 0, output: 0 };
  return (
    (inputTokens / 1_000_000) * costs.input +
    (outputTokens / 1_000_000) * costs.output
  );
}
