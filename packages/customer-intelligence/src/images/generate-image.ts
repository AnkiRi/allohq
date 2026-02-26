import { generateWithFlux } from "./providers/flux";
import { generateWithDalle } from "./providers/dalle";
import { searchUnsplash } from "./providers/unsplash";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenerateImageInput {
  purpose: "hero_banner" | "product_lifestyle" | "background" | "card";
  prompt: string;
  brandStyle?: {
    aesthetic: string;
    suggestedColors: string[];
  };
  dimensions?: { width: number; height: number };
  fallbackToStock?: boolean;
}

export interface GenerateImageOutput {
  url: string;
  provider: "flux" | "dalle" | "unsplash";
  prompt: string;
  cost: number;
}

// ---------------------------------------------------------------------------
// Default dimensions by purpose
// ---------------------------------------------------------------------------

const DEFAULT_DIMENSIONS: Record<
  GenerateImageInput["purpose"],
  { width: number; height: number }
> = {
  hero_banner: { width: 1200, height: 600 },
  product_lifestyle: { width: 800, height: 800 },
  background: { width: 1200, height: 800 },
  card: { width: 600, height: 400 },
};

// ---------------------------------------------------------------------------
// Prompt enhancement
// ---------------------------------------------------------------------------

function enhancePrompt(input: GenerateImageInput): string {
  const parts: string[] = [input.prompt];

  if (input.brandStyle) {
    parts.push(`Style: ${input.brandStyle.aesthetic}.`);
    if (input.brandStyle.suggestedColors.length > 0) {
      parts.push(
        `Color palette: ${input.brandStyle.suggestedColors.join(", ")}.`,
      );
    }
  }

  // Add purpose-specific hints
  switch (input.purpose) {
    case "hero_banner":
      parts.push("Wide cinematic composition, suitable as a website hero banner.");
      break;
    case "product_lifestyle":
      parts.push("Product lifestyle photography, clean and professional.");
      break;
    case "background":
      parts.push("Abstract or subtle background, suitable for overlaying text.");
      break;
    case "card":
      parts.push("Compact composition, suitable for a card or thumbnail.");
      break;
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Provider wrappers (return GenerateImageOutput | null)
// ---------------------------------------------------------------------------

async function tryFlux(
  prompt: string,
  width: number,
  height: number,
): Promise<GenerateImageOutput | null> {
  const url = await generateWithFlux({ prompt, width, height });
  if (!url) return null;
  return { url, provider: "flux", prompt, cost: 0.05 };
}

async function tryDalle(
  prompt: string,
  width: number,
  height: number,
): Promise<GenerateImageOutput | null> {
  const url = await generateWithDalle({ prompt, width, height });
  if (!url) return null;
  return { url, provider: "dalle", prompt, cost: 0.04 };
}

async function tryUnsplash(
  prompt: string,
): Promise<GenerateImageOutput | null> {
  const url = await searchUnsplash({ prompt });
  if (!url) return null;
  return { url, provider: "unsplash", prompt, cost: 0 };
}

// ---------------------------------------------------------------------------
// Routing logic
// ---------------------------------------------------------------------------

type ProviderFn = () => Promise<GenerateImageOutput | null>;

function getProviderChain(
  purpose: GenerateImageInput["purpose"],
  prompt: string,
  width: number,
  height: number,
  fallbackToStock: boolean,
): ProviderFn[] {
  const chain: ProviderFn[] = [];

  // Primary + secondary AI provider based on purpose
  switch (purpose) {
    case "hero_banner":
    case "background":
      // Flux first (more creative), DALL-E fallback
      chain.push(() => tryFlux(prompt, width, height));
      chain.push(() => tryDalle(prompt, width, height));
      break;
    case "product_lifestyle":
    case "card":
      // DALL-E first (better for product-adjacent), Flux fallback
      chain.push(() => tryDalle(prompt, width, height));
      chain.push(() => tryFlux(prompt, width, height));
      break;
  }

  // Stock photo fallback
  if (fallbackToStock) {
    chain.push(() => tryUnsplash(prompt));
  }

  return chain;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Generate an image for marketing content using AI image providers.
 * Routes to the best provider based on purpose and falls back through
 * the chain if earlier providers fail.
 */
export async function generateImage(
  input: GenerateImageInput,
): Promise<GenerateImageOutput> {
  const { width, height } =
    input.dimensions ?? DEFAULT_DIMENSIONS[input.purpose];
  const enhancedPrompt = enhancePrompt(input);
  const fallbackToStock = input.fallbackToStock ?? false;

  console.log(
    `[Image] Generating for purpose="${input.purpose}" ${width}x${height} fallbackToStock=${fallbackToStock}`,
  );

  const chain = getProviderChain(
    input.purpose,
    enhancedPrompt,
    width,
    height,
    fallbackToStock,
  );

  for (const providerFn of chain) {
    const result = await providerFn();
    if (result) {
      console.log(
        `[Image] Done — provider=${result.provider} cost=$${result.cost}`,
      );
      return result;
    }
  }

  throw new Error(
    `[Image] All providers failed for purpose="${input.purpose}". ` +
      `Prompt: "${input.prompt.slice(0, 80)}..."`,
  );
}
