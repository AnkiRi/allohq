import OpenAI from "openai";

export interface OpenAiImageInput {
  prompt: string;
  width: number;
  height: number;
}

/**
 * OpenAI image generation — the model behind ChatGPT's images.
 *
 * This replaces a hardcoded `dall-e-3`, which failed in production against a
 * real key with:
 *
 *   400 The model 'dall-e-3' does not exist.
 *
 * dall-e-3 is not available on every account or project key, and OpenAI's
 * current image model is `gpt-image-1` — the same one ChatGPT uses. So the
 * models are tried in order and the first one the account can actually reach
 * wins. A 400 naming a model is a capability answer, not a transient failure,
 * so it moves on rather than retrying.
 *
 * `gpt-image-1` returns base64 rather than a URL, so the result is normalised
 * to a data URL and the caller's persistence step stays identical either way.
 */
const MODELS = ["gpt-image-1", "dall-e-3"] as const;

/** Sizes differ between the two models; ask each for one it supports. */
function sizeFor(model: string, width: number, height: number): string {
  const ratio = width / height;
  if (model === "gpt-image-1") {
    if (ratio > 1.3) return "1536x1024";
    if (ratio < 0.77) return "1024x1536";
    return "1024x1024";
  }
  if (ratio > 1.3) return "1792x1024";
  if (ratio < 0.77) return "1024x1792";
  return "1024x1024";
}

function unavailable(message: string): boolean {
  return (
    /does not exist|do not have access|not supported|unknown model|must be verified/i.test(message)
  );
}

export async function generateWithOpenAiImages(
  input: OpenAiImageInput,
): Promise<string | null> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    console.log("[Image/OpenAI] OPENAI_API_KEY not set, skipping");
    return null;
  }
  const openai = new OpenAI({ apiKey });

  for (const model of MODELS) {
    try {
      const size = sizeFor(model, input.width, input.height);
      console.log(`[Image/OpenAI] Trying ${model} at ${size}`);
      const response = await openai.images.generate({
        model,
        prompt: input.prompt,
        size: size as never,
        n: 1,
      });
      const first = response.data?.[0];
      if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
      if (first?.url) return first.url;
      console.log(`[Image/OpenAI] ${model} returned no image`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (unavailable(message)) {
        // This account cannot use this model. Try the next one rather than
        // reporting a generic failure the operator cannot act on.
        console.log(`[Image/OpenAI] ${model} unavailable on this account: ${message}`);
        continue;
      }
      console.log(`[Image/OpenAI] ${model} failed: ${message}`);
      return null;
    }
  }
  console.log("[Image/OpenAI] no image model on this account could be used");
  return null;
}
