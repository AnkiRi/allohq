import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Supported models
// ---------------------------------------------------------------------------

export type AIModelId =
  | "claude-sonnet-4-6"
  | "gpt-4o"
  | "gpt-4o-mini";

export type AIProvider = "anthropic" | "openai";

export interface AIModel {
  id: AIModelId;
  provider: AIProvider;
  label: string;
  description: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  tier: "premium" | "standard" | "economy";
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

/** Default fallback chain: if selected model fails, try next in list */
const FALLBACK_CHAIN: Record<AIModelId, AIModelId[]> = {
  "claude-sonnet-4-6": ["gpt-4o", "gpt-4o-mini"],
  "gpt-4o": ["claude-sonnet-4-6", "gpt-4o-mini"],
  "gpt-4o-mini": ["gpt-4o", "claude-sonnet-4-6"],
};

// ---------------------------------------------------------------------------
// Unified completion interface
// ---------------------------------------------------------------------------

export interface CompletionRequest {
  model?: AIModelId;
  prompt: string;
  system?: string;
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
}

export interface CompletionResult {
  content: string;
  model: AIModelId;
  provider: AIProvider;
  usedFallback: boolean;
  inputTokens: number;
  outputTokens: number;
}

// ---------------------------------------------------------------------------
// Provider-specific callers
// ---------------------------------------------------------------------------

interface ProviderResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

async function callAnthropic(
  prompt: string,
  model: AIModelId,
  temperature: number,
  maxTokens: number,
  system?: string,
): Promise<ProviderResult> {
  const client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    ...(system ? { system } : {}),
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Anthropic returned empty or non-text response");
  }
  return {
    content: block.text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

async function callOpenAI(
  prompt: string,
  model: AIModelId,
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
  system?: string,
): Promise<ProviderResult> {
  const client = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

  const messages: { role: "system" | "user"; content: string }[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty response");
  }
  return {
    content,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Main completion function with fallback
// ---------------------------------------------------------------------------

const DEFAULT_MODEL: AIModelId = "claude-sonnet-4-6";

export async function complete(request: CompletionRequest): Promise<CompletionResult> {
  const primaryModel = request.model ?? DEFAULT_MODEL;
  const temperature = request.temperature ?? 0.7;
  const maxTokens = request.maxTokens ?? 4096;
  const jsonMode = request.jsonMode ?? false;
  const system = request.system;

  const fallbacks = FALLBACK_CHAIN[primaryModel] ?? FALLBACK_CHAIN[DEFAULT_MODEL] ?? [];
  const modelsToTry: AIModelId[] = [primaryModel, ...fallbacks];

  let lastError: Error | undefined;

  for (let i = 0; i < modelsToTry.length; i++) {
    const modelId = modelsToTry[i]!;
    const modelDef = AI_MODELS.find((m) => m.id === modelId);
    if (!modelDef) continue;

    // Skip if API key not configured for this provider
    if (modelDef.provider === "anthropic" && !process.env["ANTHROPIC_API_KEY"]) continue;
    if (modelDef.provider === "openai" && !process.env["OPENAI_API_KEY"]) continue;

    try {
      let result: ProviderResult;
      if (modelDef.provider === "anthropic") {
        result = await callAnthropic(request.prompt, modelId, temperature, maxTokens, system);
        // Anthropic doesn't have native JSON mode, so extract JSON from response
        if (jsonMode) {
          result.content = extractJson(result.content);
        }
      } else {
        result = await callOpenAI(request.prompt, modelId, temperature, maxTokens, jsonMode, system);
      }

      return {
        content: result.content,
        model: modelId,
        provider: modelDef.provider,
        usedFallback: i > 0,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[AI] ${modelId} failed: ${lastError.message}. Trying fallback...`);
    }
  }

  throw new Error(
    `All AI models failed. Last error: ${lastError?.message ?? "unknown"}`
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract JSON from a response that might have surrounding text */
function extractJson(text: string): string {
  // Try to find JSON object or array
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];

  // Already valid JSON
  return text;
}
