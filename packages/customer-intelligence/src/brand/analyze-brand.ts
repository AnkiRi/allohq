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

const BRAND_DOCUMENT_PROMPT = `You are a brand analyst. The merchant has provided their own brand guidelines. These are authoritative — extract tone, vocabulary, and identity from this document.

## Brand Guidelines Document
{{document}}

{{#if productSamples}}
## Supplementary Product Data
Use this product data as supplementary context for visual style and sample copy only. The brand document above is the PRIMARY source.

Store Name: {{storeName}}
{{productSamples}}
{{/if}}

Based on the brand guidelines document (and optionally the product data), provide a structured brand analysis as JSON:

{
  "brandName": "the brand name from the document",
  "brandDescription": "1-2 sentence summary of what this brand is about, drawn from the document",
  "toneAttributes": {
    "formality": "formal|semi-formal|casual|very-casual",
    "humor": "none|light|moderate|heavy",
    "energy": "calm|moderate|high|intense",
    "warmth": "professional|friendly|warm|intimate"
  },
  "vocabulary": {
    "preferredWords": ["words the brand commonly uses or recommends"],
    "ctaPatterns": ["call-to-action phrases that match the brand voice"],
    "brandTerms": ["brand-specific terminology from the guidelines"]
  },
  "visualStyle": {
    "aesthetic": "luxury|minimal|playful|bold|natural|tech",
    "suggestedColors": ["#hex colors that match the brand, 3-5 colors"],
    "fontStyle": "serif|sans-serif|mono|display"
  },
  "sampleCopy": ["3-5 example sentences/phrases that exemplify the brand voice described in the document"]
}

Return ONLY valid JSON, no other text.`;

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
    task: "analysis", // brand VOICE — frontier: all customer-facing copy inherits it
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

/**
 * Analyze brand voice from a merchant-provided brand document using an LLM.
 * The document is used as the PRIMARY input; product data is supplementary.
 */
export async function analyzeBrandFromDocument(
  document: string,
  storeData?: Partial<StoreData>,
  options?: { model?: AIModelId },
): Promise<BrandVoiceResult & { model: string; inputTokens: number; outputTokens: number }> {
  let productSamples = "";
  if (storeData?.products && storeData.products.length > 0) {
    productSamples = storeData.products
      .slice(0, 15)
      .map((p, i) => {
        const parts = [`${i + 1}. "${p.title}" — $${p.price.toFixed(2)}`];
        if (p.productType) parts.push(`  Category: ${p.productType}`);
        if (p.vendor) parts.push(`  Brand: ${p.vendor}`);
        if (p.description) parts.push(`  Description: ${p.description.slice(0, 300)}`);
        return parts.join("\n");
      })
      .join("\n\n");
  }

  let prompt = BRAND_DOCUMENT_PROMPT.replace("{{document}}", document);

  // Handle conditional product section
  if (productSamples) {
    prompt = prompt
      .replace("{{#if productSamples}}", "")
      .replace("{{/if}}", "")
      .replace("{{storeName}}", storeData?.storeName ?? "Unknown")
      .replace("{{productSamples}}", productSamples);
  } else {
    // Remove the entire conditional block
    prompt = prompt.replace(/\{\{#if productSamples\}\}[\s\S]*?\{\{\/if\}\}/g, "");
  }

  const result = await complete({
    model: options?.model,
    task: "analysis", // brand VOICE — frontier: all customer-facing copy inherits it
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
