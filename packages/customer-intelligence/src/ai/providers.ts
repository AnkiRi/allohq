import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Provider-agnostic adapter layer.
//
// Every concrete model vendor is hidden behind the `LlmProvider` interface.
// The gateway picks a provider + model from the tier policy and never talks to
// a vendor SDK directly. Adding/swapping a provider is a matter of writing one
// more `LlmProvider` implementation and registering it — not a rewrite.
// ---------------------------------------------------------------------------

export type AIProvider = "anthropic" | "openai" | "google";

/** Normalised request handed to a provider adapter. */
export interface ProviderRequest {
  model: string;
  prompt: string;
  system?: string;
  temperature: number;
  maxTokens: number;
  jsonMode: boolean;
}

/** Normalised result returned by a provider adapter. */
export interface ProviderResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmProvider {
  readonly name: AIProvider;
  /** Whether this provider is usable right now (api key present, etc). */
  isAvailable(): boolean;
  complete(req: ProviderRequest): Promise<ProviderResult>;
}

/** Extract a JSON object/array from a response that may have surrounding text. */
function extractJson(text: string): string {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];
  return text;
}

// ---------------------------------------------------------------------------
// Anthropic adapter
// ---------------------------------------------------------------------------

class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic" as const;

  isAvailable(): boolean {
    return !!process.env["ANTHROPIC_API_KEY"];
  }

  async complete(req: ProviderRequest): Promise<ProviderResult> {
    // timeout: fail fast instead of hanging a worker; maxRetries: 1 so the gateway's
    // circuit-breaker handles cross-provider fallback rather than slow SDK retries.
    const client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"], timeout: 60_000, maxRetries: 1 });

    const response = await client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      ...(req.system ? { system: req.system } : {}),
      messages: [{ role: "user", content: req.prompt }],
    });

    const block = response.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Anthropic returned empty or non-text response");
    }
    // Anthropic has no native JSON mode — coerce when requested.
    const content = req.jsonMode ? extractJson(block.text) : block.text;
    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}

// ---------------------------------------------------------------------------
// OpenAI adapter
// ---------------------------------------------------------------------------

class OpenAIProvider implements LlmProvider {
  readonly name = "openai" as const;

  isAvailable(): boolean {
    return !!process.env["OPENAI_API_KEY"];
  }

  async complete(req: ProviderRequest): Promise<ProviderResult> {
    const client = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"], timeout: 60_000, maxRetries: 1 });

    const messages: { role: "system" | "user"; content: string }[] = [];
    if (req.system) messages.push({ role: "system", content: req.system });
    messages.push({ role: "user", content: req.prompt });

    const response = await client.chat.completions.create({
      model: req.model,
      messages,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      ...(req.jsonMode ? { response_format: { type: "json_object" } } : {}),
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
}

// ---------------------------------------------------------------------------
// Registry — config, not a rewrite, to add a provider.
// ---------------------------------------------------------------------------

/**
 * Google Gemini text.
 *
 * Written so Gemini can appear in TEXT routing honestly — a registry entry
 * without an adapter is not an implementation, and Gemini was listed before
 * this existed. Plain fetch, so the request shape is assertable in tests.
 */
class GoogleProvider implements LlmProvider {
  readonly name = "google" as const;

  isAvailable(): boolean {
    return Boolean(process.env["GOOGLE_API_KEY"]?.trim());
  }

  async complete(req: ProviderRequest): Promise<ProviderResult> {
    const apiKey = process.env["GOOGLE_API_KEY"]?.trim();
    if (!apiKey) throw new Error("GOOGLE_API_KEY is not set");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: req.prompt }] }],
          ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
          generationConfig: {
            temperature: req.temperature,
            maxOutputTokens: req.maxTokens,
            ...(req.jsonMode ? { responseMimeType: "application/json" } : {}),
          },
        }),
        signal: AbortSignal.timeout(120_000),
      },
    );

    const payload = (await response.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(`Gemini ${req.model}: ${payload.error?.message ?? `HTTP ${response.status}`}`);
    }

    const content = (payload.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!content) throw new Error(`Gemini ${req.model} returned no text`);

    return {
      content: req.jsonMode ? extractJson(content) : content,
      inputTokens: payload.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}

const PROVIDERS: Record<AIProvider, LlmProvider> = {
  anthropic: new AnthropicProvider(),
  openai: new OpenAIProvider(),
  google: new GoogleProvider(),
};

export function getProvider(name: AIProvider): LlmProvider {
  return PROVIDERS[name];
}
