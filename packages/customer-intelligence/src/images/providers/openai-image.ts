import OpenAI from "openai";
import type { VisualGenerationRequest } from "../visual-provider";

/**
 * OpenAI gpt-image-1 with a reference image.
 *
 * `images.edit` accepts the real product photo as input, so the model works
 * from the product rather than from a description of it. Without a reference
 * this adapter declines — plain DALL·E already covers text-to-image, and
 * pretending an edit call without an input is "grounded" is exactly the claim
 * this provider exists to make honest.
 *
 * Opt-in: OPENAI_API_KEY *and* JOON_OPENAI_IMAGE_REFERENCE_ENABLED.
 */

function toSize(width: number, height: number): "1024x1024" | "1536x1024" | "1024x1536" {
  const ratio = width / height;
  if (ratio > 1.3) return "1536x1024";
  if (ratio < 0.77) return "1024x1536";
  return "1024x1024";
}

export async function generateWithOpenAiImage(
  request: VisualGenerationRequest,
): Promise<string | null> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    console.log("[Image/OpenAI] OPENAI_API_KEY not set, skipping");
    return null;
  }
  const reference = request.referenceImageUrls?.[0];
  if (!reference) {
    console.log("[Image/OpenAI] no reference image supplied, skipping");
    return null;
  }

  try {
    const source = await fetch(reference);
    if (!source.ok) {
      console.log(`[Image/OpenAI] reference image unreachable (${source.status})`);
      return null;
    }
    const bytes = await source.arrayBuffer();
    const contentType = source.headers.get("content-type") ?? "image/png";
    const file = new File([new Uint8Array(bytes)], "product.png", { type: contentType });

    const openai = new OpenAI({ apiKey });
    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: file,
      prompt: request.prompt,
      size: toSize(request.width, request.height),
    });

    const first = response.data?.[0];
    if (!first) {
      console.log("[Image/OpenAI] no image returned");
      return null;
    }
    // gpt-image-1 returns base64; hand back a data URL so the caller's
    // persistence step is identical for every provider.
    if (first.b64_json) return `data:image/png;base64,${first.b64_json}`;
    return first.url ?? null;
  } catch (error) {
    console.log(
      "[Image/OpenAI] generation failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
