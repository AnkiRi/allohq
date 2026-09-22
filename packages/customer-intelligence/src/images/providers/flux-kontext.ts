import Replicate from "replicate";
import type { VisualGenerationRequest } from "../visual-provider";

/**
 * Flux Kontext via Replicate — image-to-image with a reference.
 *
 * Kontext takes an input image and edits the scene around it, which is what
 * makes "your actual product, in this setting" truthful rather than a hopeful
 * description. Without a reference image it is not worth its extra cost over
 * plain Flux, so it declines rather than quietly generating from text.
 *
 * Opt-in: REPLICATE_API_TOKEN *and* JOON_FLUX_KONTEXT_ENABLED, so an existing
 * Replicate token cannot silently redirect spend to a different model.
 */
export async function generateWithFluxKontext(
  request: VisualGenerationRequest,
): Promise<string | null> {
  const apiToken = process.env["REPLICATE_API_TOKEN"];
  if (!apiToken) {
    console.log("[Image/Kontext] REPLICATE_API_TOKEN not set, skipping");
    return null;
  }
  const reference = request.referenceImageUrls?.[0];
  if (!reference) {
    console.log("[Image/Kontext] no reference image supplied, skipping");
    return null;
  }

  try {
    const replicate = new Replicate({ auth: apiToken });
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(request.width, request.height);
    const aspectRatio = `${request.width / divisor}:${request.height / divisor}`;

    const output = await replicate.run("black-forest-labs/flux-kontext-pro", {
      input: {
        prompt: request.prompt,
        input_image: reference,
        aspect_ratio: aspectRatio,
        output_format: "png",
      },
    });

    const url =
      typeof output === "string"
        ? output
        : Array.isArray(output) && typeof output[0] === "string"
          ? output[0]
          : null;
    if (!url) {
      console.log("[Image/Kontext] unexpected output format");
      return null;
    }
    return url;
  } catch (error) {
    console.log(
      "[Image/Kontext] generation failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
