import type { BrandDesignTokens } from "./types";

/**
 * Generate an AI background image (seasonal/lifestyle/abstract).
 * NEVER used for product images, people, or brand-specific elements.
 *
 * This wraps the existing customer-intelligence image generation
 * (Flux/DALL-E/Unsplash providers) with brand-constrained prompts.
 */
export function buildBackgroundPrompt(
  type: "seasonal" | "lifestyle" | "abstract" | "texture",
  tokens: BrandDesignTokens,
  context?: { season?: string; theme?: string },
): string {
  const baseConstraints = "no text, no logos, no products, no people, professional commercial photography style";

  const colorPalette = `color palette: ${tokens.primaryBackground}, ${tokens.secondaryBackground}, ${tokens.accentColor}`;

  switch (type) {
    case "seasonal": {
      const season = context?.season ?? "winter";
      return `Elegant ${season} themed background for email header. Subtle, sophisticated. ${colorPalette}. ${baseConstraints}. Soft gradients, seasonal elements like subtle ${season} motifs.`;
    }
    case "lifestyle": {
      const theme = context?.theme ?? "modern lifestyle";
      return `${theme} background image, aspirational, premium feel. ${colorPalette}. ${baseConstraints}. Shallow depth of field, warm lighting, editorial style.`;
    }
    case "abstract": {
      return `Abstract geometric pattern, modern and clean. ${colorPalette}. ${baseConstraints}. Minimal shapes, gradient blends, contemporary design.`;
    }
    case "texture": {
      return `Subtle texture background, premium feel. ${colorPalette}. ${baseConstraints}. Linen, marble, or paper texture, very subtle, suitable as email background.`;
    }
  }
}

/**
 * Generate background image using the existing image generation infrastructure.
 * In production, this calls customer-intelligence/images/generate-image.ts
 */
export async function generateBackground(
  type: "seasonal" | "lifestyle" | "abstract" | "texture",
  tokens: BrandDesignTokens,
  context?: { season?: string; theme?: string },
): Promise<{ prompt: string; imageUrl: string | null }> {
  const prompt = buildBackgroundPrompt(type, tokens, context);

  // In production, this would call:
  // import { generateImage } from "@allohq/customer-intelligence";
  // const result = await generateImage({ prompt, width: 600, height: 300 });
  // return { prompt, imageUrl: result.url };

  console.log(`[ai-image] Generated prompt for ${type} background: ${prompt.slice(0, 80)}...`);

  return { prompt, imageUrl: null };
}
