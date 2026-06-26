import {
  getProvider,
  type AIProvider,
  type ProviderRequest,
  type ProviderResult,
} from "./providers";
import {
  resolveModelChain,
  getModel,
  type AIModelId,
  type AITask,
} from "./policy";
import { cacheGet, cacheSet, isCacheable, type CacheKeyParts } from "./cache";

// ---------------------------------------------------------------------------
// THE GATEWAY — single entry point every completion call routes through.
//
// Responsibilities:
//   1. task → tier → model resolution (policy.ts)
//   2. provider-agnostic dispatch (providers.ts)
//   3. graceful fallback: skip unavailable/over-quota providers and try the
//      next candidate; never throw while a viable fallback remains.
//   4. response caching for deterministic calls (cache.ts)
//
// `complete()` keeps its original public signature so every existing caller
// keeps working; the only addition is the optional `task` field.
// ---------------------------------------------------------------------------

export interface CompletionRequest {
  /** Explicit model. If omitted, `task` (or the default) picks one. */
  model?: AIModelId;
  /** Declarative intent — drives task→tier routing when no model is given. */
  task?: AITask;
  prompt: string;
  system?: string;
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
  /** Force-disable the response cache for this call. */
  noCache?: boolean;
}

export interface CompletionResult {
  content: string;
  model: AIModelId;
  provider: AIProvider;
  /** True when the chosen model was not the first candidate (a fallback ran). */
  usedFallback: boolean;
  /** True when the response was served from the response cache. */
  cached: boolean;
  inputTokens: number;
  outputTokens: number;
}

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Is an error a "skip to the next provider" signal? Quota/rate-limit (429),
 * auth (401/403) and missing-key errors are recoverable via fallback.
 */
function isRecoverable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 429 || status === 401 || status === 403 || status === 500 || status === 503) {
    return true;
  }
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("api key") ||
    msg.includes("overloaded")
  );
}

export async function complete(request: CompletionRequest): Promise<CompletionResult> {
  const temperature = request.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
  const jsonMode = request.jsonMode ?? false;
  const system = request.system;

  // 1. Resolve candidate models from task→tier policy (or explicit model).
  const candidates = resolveModelChain({ model: request.model, task: request.task });

  let lastError: Error | undefined;
  let attempted = 0;

  for (const modelId of candidates) {
    const modelDef = getModel(modelId);
    if (!modelDef) continue;

    const provider = getProvider(modelDef.provider);

    // 2. Graceful degrade: skip providers with no key / not available, so the
    //    chain falls through to the working default (Claude) instead of failing.
    if (!provider.isAvailable()) continue;

    const providerReq: ProviderRequest = {
      model: modelId,
      prompt: request.prompt,
      ...(system ? { system } : {}),
      temperature,
      maxTokens,
      jsonMode,
    };

    const cacheParts: CacheKeyParts = {
      model: modelId,
      prompt: request.prompt,
      system,
      temperature,
      maxTokens,
      jsonMode,
    };

    // 3. Response cache (deterministic calls only). A cache hit short-circuits
    //    the network call entirely — the core margin/latency lever.
    const useCache = !request.noCache && isCacheable(cacheParts);
    if (useCache) {
      const hit = cacheGet(cacheParts);
      if (hit) {
        return {
          content: hit.content,
          model: modelId,
          provider: modelDef.provider,
          usedFallback: attempted > 0,
          cached: true,
          inputTokens: hit.inputTokens,
          outputTokens: hit.outputTokens,
        };
      }
    }

    attempted++;

    try {
      const result: ProviderResult = await provider.complete(providerReq);
      if (useCache) cacheSet(cacheParts, result);

      return {
        content: result.content,
        model: modelId,
        provider: modelDef.provider,
        usedFallback: attempted > 1,
        cached: false,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[AI Gateway] ${modelId} (${modelDef.provider}) failed: ${lastError.message}.` +
          (isRecoverable(err) ? " Falling back..." : " Non-recoverable, but trying next candidate..."),
      );
      // Continue to next candidate regardless — never hard-fail while a viable
      // fallback remains in the chain.
    }
  }

  throw new Error(
    `All AI models failed or unavailable. Last error: ${lastError?.message ?? "no provider configured"}`,
  );
}
