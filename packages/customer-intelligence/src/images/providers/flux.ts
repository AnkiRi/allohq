import Replicate from "replicate";

export interface FluxInput {
  prompt: string;
  width: number;
  height: number;
}

/**
 * Generate an image using Flux 1.1 Pro via Replicate.
 * Returns the image URL on success, or null if generation fails.
 * Cost: ~$0.05 per image.
 */
export async function generateWithFlux(
  input: FluxInput,
): Promise<string | null> {
  const apiToken = process.env["REPLICATE_API_TOKEN"];
  if (!apiToken) {
    console.log("[Image/Flux] REPLICATE_API_TOKEN not set, skipping");
    return null;
  }

  try {
    const replicate = new Replicate({ auth: apiToken });

    // Compute aspect ratio string from dimensions
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(input.width, input.height);
    const aspectRatio = `${input.width / divisor}:${input.height / divisor}`;

    console.log(
      `[Image/Flux] Generating ${input.width}x${input.height} (${aspectRatio}) — prompt: "${input.prompt.slice(0, 80)}..."`,
    );

    const output = await replicate.run("black-forest-labs/flux-1.1-pro", {
      input: {
        prompt: input.prompt,
        width: input.width,
        height: input.height,
        aspect_ratio: aspectRatio,
      },
    });

    // Replicate returns the output as a string URL or an array with one URL
    const url =
      typeof output === "string"
        ? output
        : Array.isArray(output) && typeof output[0] === "string"
          ? output[0]
          : null;

    if (!url) {
      console.log("[Image/Flux] Unexpected output format:", output);
      return null;
    }

    console.log(`[Image/Flux] Success — ${url.slice(0, 80)}...`);
    return url;
  } catch (err) {
    console.log(
      `[Image/Flux] Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
