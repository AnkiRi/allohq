import OpenAI from "openai";

export interface DalleInput {
  prompt: string;
  width: number;
  height: number;
}

/**
 * Map arbitrary dimensions to the closest DALL-E 3 supported size.
 * DALL-E 3 supports: 1024x1024, 1792x1024, 1024x1792.
 */
function toDalleSize(
  width: number,
  height: number,
): "1024x1024" | "1792x1024" | "1024x1792" {
  const ratio = width / height;
  if (ratio > 1.3) return "1792x1024"; // landscape
  if (ratio < 0.77) return "1024x1792"; // portrait
  return "1024x1024"; // square-ish
}

/**
 * Generate an image using DALL-E 3 via OpenAI.
 * Returns the image URL on success, or null if generation fails.
 * Cost: ~$0.04 per image (standard quality).
 */
export async function generateWithDalle(
  input: DalleInput,
): Promise<string | null> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    console.log("[Image/DALL-E] OPENAI_API_KEY not set, skipping");
    return null;
  }

  try {
    const openai = new OpenAI({ apiKey });
    const size = toDalleSize(input.width, input.height);

    console.log(
      `[Image/DALL-E] Generating ${size} — prompt: "${input.prompt.slice(0, 80)}..."`,
    );

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: input.prompt,
      size,
      quality: "standard",
      n: 1,
    });

    const url = response.data?.[0]?.url ?? null;

    if (!url) {
      console.log("[Image/DALL-E] No URL in response");
      return null;
    }

    console.log(`[Image/DALL-E] Success — ${url.slice(0, 80)}...`);
    return url;
  } catch (err) {
    console.log(
      `[Image/DALL-E] Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
