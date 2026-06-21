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

export type AIProvider = "anthropic" | "openai";

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
    const client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });

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
    const client = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

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

const PROVIDERS: Record<AIProvider, LlmProvider> = {
  anthropic: new AnthropicProvider(),
  openai: new OpenAIProvider(),
};

export function getProvider(name: AIProvider): LlmProvider {
  return PROVIDERS[name];
}
