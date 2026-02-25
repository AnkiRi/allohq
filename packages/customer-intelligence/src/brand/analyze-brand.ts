import { complete, type AIModelId } from "../ai";

export interface StoreData {
  storeName: string;
  storeDescription?: string;
  products: {
    title: string;
    description?: string;
    productType?: string;
    vendor?: string;
    price: number;
  }[];
}

export interface BrandVoiceResult {
  brandName: string;
  brandDescription: string;
  toneAttributes: {
    formality: "formal" | "semi-formal" | "casual" | "very-casual";
    humor: "none" | "light" | "moderate" | "heavy";
    energy: "calm" | "moderate" | "high" | "intense";
    warmth: "professional" | "friendly" | "warm" | "intimate";
  };
  vocabulary: {
    preferredWords: string[];
    ctaPatterns: string[];
    brandTerms: string[];
  };
  visualStyle: {
    aesthetic: "luxury" | "minimal" | "playful" | "bold" | "natural" | "tech";
    suggestedColors: string[];
    fontStyle: "serif" | "sans-serif" | "mono" | "display";
  };
  sampleCopy: string[];
}

const BRAND_ANALYSIS_PROMPT = `You are a brand analyst. Analyze the following e-commerce store data and extract the brand's voice, personality, and visual identity.

Store Name: {{storeName}}
Store Description: {{storeDescription}}

Product Catalog (sample):
{{productSamples}}

Based on the product titles, descriptions, pricing, and overall catalog, provide a structured brand analysis as JSON:

{
  "brandName": "the store name",
  "brandDescription": "1-2 sentence summary of what this brand is about",
  "toneAttributes": {
    "formality": "formal|semi-formal|casual|very-casual",
    "humor": "none|light|moderate|heavy",
    "energy": "calm|moderate|high|intense",
    "warmth": "professional|friendly|warm|intimate"
  },
  "vocabulary": {
    "preferredWords": ["words the brand commonly uses in descriptions"],
    "ctaPatterns": ["call-to-action phrases that match the brand, e.g. 'Shop now', 'Discover more'"],
    "brandTerms": ["brand-specific terminology or product category terms"]
  },
  "visualStyle": {
    "aesthetic": "luxury|minimal|playful|bold|natural|tech",
    "suggestedColors": ["#hex colors that match the brand vibe, 3-5 colors"],
    "fontStyle": "serif|sans-serif|mono|display"
  },
  "sampleCopy": ["3-5 of the best/most representative product descriptions from the catalog"]
}

Return ONLY valid JSON, no other text.`;

/**
 * Analyze brand voice from store data using an LLM.
 */
export async function analyzeBrandVoice(
  storeData: StoreData,
  options?: { model?: AIModelId },
): Promise<BrandVoiceResult & { model: string; inputTokens: number; outputTokens: number }> {
  // Build product samples (max 15 products to keep prompt reasonable)
  const productSamples = storeData.products
    .slice(0, 15)
    .map((p, i) => {
      const parts = [`${i + 1}. "${p.title}" — $${p.price.toFixed(2)}`];
      if (p.productType) parts.push(`  Category: ${p.productType}`);
      if (p.vendor) parts.push(`  Brand: ${p.vendor}`);
      if (p.description) parts.push(`  Description: ${p.description.slice(0, 300)}`);
      return parts.join("\n");
    })
    .join("\n\n");

  const prompt = BRAND_ANALYSIS_PROMPT
    .replace("{{storeName}}", storeData.storeName)
    .replace("{{storeDescription}}", storeData.storeDescription ?? "Not available")
    .replace("{{productSamples}}", productSamples);

  const result = await complete({
    model: options?.model,
    prompt,
    temperature: 0.3,
    jsonMode: true,
  });

  const parsed = JSON.parse(result.content) as BrandVoiceResult;
  return {
    ...parsed,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
