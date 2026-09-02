import { complete, type AIModelId, type ModelHarnessConfig } from "../ai";
import type { EmailBlock } from "@allohq/email-builder";
import type { EmailIntent } from "../context/intent-mapper";
import { brandVoiceBlock, intentInstructions, formatProductsForPrompt } from "./prompt-templates";
import { generateImage } from "../images/generate-image";
import { getLayoutById } from "./layout-templates";

export type CreativeIntensity = "text_heavy" | "balanced" | "visual_heavy";

export interface BrandSettings {
  logoUrl?: string | null;
  logoPosition?: "left" | "center" | "right";
  headerBgColor?: string | null;
  footerText?: string | null;
  showSocialLinks?: boolean;
  showAddress?: boolean;
  storeName?: string | null;
  address?: { address1?: string; city?: string; province?: string; zip?: string; country?: string } | null;
  socialLinks?: Record<string, string> | null;
}

export interface GenerateEmailInput {
  brandProfile?: {
    brandName: string;
    brandDescription?: string | null;
    toneAttributes: Record<string, string>;
    vocabulary: Record<string, string[]>;
    visualStyle: Record<string, string | string[]>;
    sampleCopy: string[];
  };
  brandSettings?: BrandSettings;
  intent: EmailIntent;
  segment?: { name: string; description: string };
  products: {
    id: string;
    title: string;
    description?: string;
    imageUrl?: string;
    price: number;
    handle?: string;
  }[];
  storeUrl?: string; // e.g. "https://allohq3.myshopify.com"
  context?: {
    festivity?: string;
    discount?: { type: "percentage" | "fixed"; value: number; code: string };
    funnelStage?: string;
  };
  creativeIntensity?: CreativeIntensity;
  layoutTemplate?: string; // layout skeleton ID from LAYOUT_TEMPLATES
  toneOverride?: string; // "more formal" | "more casual" | "more playful" | etc
  tweaks?: string;
  model?: AIModelId;
  modelHarness?: ModelHarnessConfig | unknown;
}

export interface GenerateEmailOutput {
  subject: string;
  previewText: string;
  blocks: EmailBlock[];
  selectedProductIds: string[];
  reasoning: string;
  promptUsed: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  imageCosts: number;
}

function buildPrompt(input: GenerateEmailInput): string {
  const sections: string[] = [];

  sections.push(`You are an expert email marketing copywriter. Generate a complete email template.`);

  // Brand voice
  if (input.brandProfile) {
    sections.push(brandVoiceBlock({
      brandName: input.brandProfile.brandName,
      toneAttributes: input.brandProfile.toneAttributes,
      vocabulary: input.brandProfile.vocabulary,
      visualStyle: input.brandProfile.visualStyle,
      sampleCopy: input.brandProfile.sampleCopy,
    }));
  }

  // Intent instructions
  sections.push(intentInstructions(input.intent));

  // Segment
  if (input.segment) {
    sections.push(`
TARGET AUDIENCE:
- Segment: ${input.segment.name}
- Description: ${input.segment.description}
Tailor the messaging and product selection to this audience.`);
  }

  // Store URL
  if (input.storeUrl) {
    sections.push(`\nSTORE URL: ${input.storeUrl}`);
  }

  // Products
  sections.push(`
AVAILABLE PRODUCTS (choose the most relevant 2-4 for this email):
${formatProductsForPrompt(input.products, input.storeUrl)}`);

  // Context
  if (input.context) {
    const ctxParts: string[] = [];
    if (input.context.festivity) ctxParts.push(`Festivity/Occasion: ${input.context.festivity}`);
    if (input.context.discount) {
      const d = input.context.discount;
      ctxParts.push(`Discount: ${d.type === "percentage" ? `${d.value}%` : `$${d.value}`} off, code: ${d.code}`);
    }
    if (input.context.funnelStage) ctxParts.push(`Funnel Stage: ${input.context.funnelStage}`);
    if (ctxParts.length > 0) {
      sections.push(`\nCONTEXT:\n${ctxParts.join("\n")}`);
    }
  }

  // Creative intensity
  const intensity = input.creativeIntensity ?? "balanced";
  const intensityInstructions: Record<string, string> = {
    text_heavy: `
CREATIVE INTENSITY: TEXT HEAVY
- Focus on compelling copy. Use text blocks primarily. Minimal images. No hero block.
- Write longer, more persuasive body copy. Let the words do the selling.
- Generate 6-10 blocks.`,
    balanced: `
CREATIVE INTENSITY: BALANCED
- Mix of visual and text elements. Use a hero block for the opener. Include 1-2 product images.
- Use icon_row for trust signals if appropriate. Balance copy with visuals.
- Generate 8-12 blocks.`,
    visual_heavy: `
CREATIVE INTENSITY: VISUAL HEAVY
- Maximum visual impact. MUST use a hero block as the first content block.
- Use icon_row for trust signals (e.g., free shipping, secure checkout, easy returns).
- Use a testimonial block for social proof.
- Large product images. Bold colors from the brand palette.
- Generate 10-15 blocks.`,
  };
  sections.push(intensityInstructions[intensity] ?? intensityInstructions["balanced"]!);

  // Layout template
  if (input.layoutTemplate) {
    const layout = getLayoutById(input.layoutTemplate);
    if (layout) {
      sections.push(`
LAYOUT TEMPLATE: ${layout.name}
You MUST follow this exact block sequence: ${layout.blockTypes.join(" → ")}
Description: ${layout.description}
Generate EXACTLY these block types in this order. Fill in content appropriate for the intent.`);
    }
  }

  // Tone override
  if (input.toneOverride) {
    sections.push(`\nTONE OVERRIDE: Write the email in a ${input.toneOverride} tone. This overrides the brand voice tone for this specific email.`);
  }

  // Brand settings — mandatory header/footer
  if (input.brandSettings) {
    const bs = input.brandSettings;
    const headerParts: string[] = [];
    const footerParts: string[] = [];

    if (bs.logoUrl) {
      headerParts.push(`MANDATORY: Include a "header" block as the FIRST block with props: { "logoSrc": "${bs.logoUrl}", "align": "${bs.logoPosition ?? "center"}"${bs.headerBgColor ? `, "bgColor": "${bs.headerBgColor}"` : ""} }`);
    } else if (bs.headerBgColor) {
      headerParts.push(`MANDATORY: Include a "header" block as the FIRST block with props: { "align": "${bs.logoPosition ?? "center"}", "bgColor": "${bs.headerBgColor}" }`);
    }

    // Build footer content
    const footerLines: string[] = [];
    if (bs.showAddress && bs.address) {
      const addr = [bs.address.address1, bs.address.city, bs.address.province, bs.address.zip, bs.address.country].filter(Boolean).join(", ");
      if (addr) footerLines.push(`${bs.storeName ?? "Store"} · ${addr}`);
    }
    if (bs.showSocialLinks && bs.socialLinks) {
      const links = Object.entries(bs.socialLinks).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" | ");
      if (links) footerLines.push(links);
    }
    if (bs.footerText) footerLines.push(bs.footerText);

    if (footerLines.length > 0) {
      footerParts.push(`MANDATORY: Include a "footer" block as the LAST block with props: { "text": "${footerLines.join("\\n")}", "unsubscribeText": "Unsubscribe" }`);
    } else {
      footerParts.push(`MANDATORY: Include a "footer" block as the LAST block with props: { "text": "${bs.storeName ?? "Store"}", "unsubscribeText": "Unsubscribe" }`);
    }

    if (headerParts.length > 0 || footerParts.length > 0) {
      sections.push(`\nEMAIL HEADER & FOOTER (REQUIRED — always include these):\n${[...headerParts, ...footerParts].join("\n")}`);
    }
  }

  // Tweaks
  if (input.tweaks) {
    sections.push(`\nADDITIONAL INSTRUCTIONS: ${input.tweaks}`);
  }

  const storeUrlExample = input.storeUrl || "https://store.example.com";

  sections.push(`
OUTPUT FORMAT — Return valid JSON only:
{
  "subject": "Email subject line (max 60 chars)",
  "previewText": "Preview text shown in inbox (max 90 chars)",
  "reasoning": "1-2 sentences explaining your choices",
  "selectedProductIds": ["product IDs chosen from the available products"],
  "blocks": [
    { "id": "b1", "type": "hero", "props": { "heading": "Bold Headline", "subtext": "Supporting text", "buttonText": "Shop Now", "buttonHref": "${storeUrlExample}", "bgColor": "#1a1a1a", "textColor": "#FFFFFF", "align": "center" } },
    { "id": "b2", "type": "text", "props": { "html": "<p>body text</p>", "align": "center" } },
    { "id": "b3", "type": "icon_row", "props": { "items": [{ "icon": "🚚", "label": "Free Shipping" }, { "icon": "🔒", "label": "Secure Checkout" }, { "icon": "↩️", "label": "Easy Returns" }] } },
    { "id": "b4", "type": "product", "props": { "productId": "the product ID", "showPrice": true, "showImage": true, "showDescription": true, "buttonText": "Shop Now", "buttonHref": "${storeUrlExample}/products/product-handle" } },
    { "id": "b5", "type": "testimonial", "props": { "quote": "customer quote", "author": "Name", "rating": 5 } },
    { "id": "b6", "type": "countdown", "props": { "endDate": "2026-03-15T00:00:00Z", "label": "Sale ends in", "bgColor": "#FF4444", "textColor": "#FFFFFF" } },
    { "id": "b7", "type": "button", "props": { "text": "CTA Text", "href": "${storeUrlExample}/collections/all", "bgColor": "#000", "textColor": "#fff" } },
    { "id": "b8", "type": "footer", "props": { "text": "unsubscribe text", "unsubscribeText": "Unsubscribe" } }
  ]
}

CRITICAL RULES:
- Each block MUST have a UNIQUE "id" (use "b1", "b2", "b3", etc — NEVER reuse an id).
- For "image" blocks: use the REAL image URL from the product list above (the "Image:" field). NEVER use placeholder URLs like example.com.
- For "product" blocks: set "buttonHref" to the REAL product URL from the product list above (the "URL:" field).
- For "button" blocks: set "href" to a real store URL (${storeUrlExample} or a product URL). NEVER use "#" as href.
- For "image" blocks with href: link to the relevant product page URL.
- For "hero" blocks: use brand colors for bgColor. Make headings impactful and concise. Do NOT include "bgImageSrc" — background images are added automatically by the system.
- For "image" blocks: ONLY use the exact "Image:" URLs from the product list above. If you don't have a real product image URL, do NOT include an "image" block. NEVER fabricate or guess image URLs.
- For "header" blocks: Do NOT include "logoSrc" — logos are injected automatically by the system from brand settings.
- For "icon_row" blocks: use relevant emoji icons and short labels.
- For "testimonial" blocks: write realistic, relatable customer quotes.
- For "countdown" blocks: only use when the email has a time-limited offer or promotion.

The blocks array should be a complete email layout using these block types:
- "header" (optional logo)
- "hero" (full-width banner with heading, subtext, CTA button, background color)
- "text" (with html content, can include <h1>, <h2>, <p> tags)
- "image" (standalone image with real product image URLs)
- "product" (product card — uses productId to resolve image/title/price automatically, set buttonHref to real product URL)
- "button" (standalone CTA button with real store/product URL)
- "icon_row" (row of 3-4 icons with labels for trust signals)
- "testimonial" (customer quote with author name and star rating)
- "countdown" (urgency timer with end date — only for time-limited offers)
- "divider" (horizontal line separator)
- "spacer" (vertical space)
- "footer" (footer text with unsubscribe)

Return ONLY valid JSON.`);

  return sections.join("\n");
}

/**
 * Post-process email blocks to generate AI images for hero and image blocks
 * when creative intensity is not text_heavy.
 */
async function postProcessImages(
  blocks: EmailBlock[],
  input: GenerateEmailInput,
  subject: string,
): Promise<{ blocks: EmailBlock[]; totalCost: number }> {
  const intensity = input.creativeIntensity ?? "balanced";
  if (intensity === "text_heavy") {
    return { blocks, totalCost: 0 };
  }

  let totalCost = 0;
  const brandStyle = input.brandProfile
    ? {
        aesthetic: (input.brandProfile.visualStyle["aesthetic"] as string) ?? "modern",
        suggestedColors: (input.brandProfile.visualStyle["suggestedColors"] as string[]) ?? [],
      }
    : undefined;

  const updatedBlocks = [...blocks];

  for (let i = 0; i < updatedBlocks.length; i++) {
    const block = updatedBlocks[i]!;

    // Generate hero banner image (only with AI providers, no stock fallback)
    if (block.type === "hero" && !block.props.bgImageSrc) {
      try {
        const imagePrompt = `${subject}. ${input.brandProfile?.brandName ?? "Brand"} marketing hero banner.`;
        const imgResult = await generateImage({
          purpose: "hero_banner",
          prompt: imagePrompt,
          brandStyle,
          fallbackToStock: false,
        });
        (block.props as Record<string, unknown>).bgImageSrc = imgResult.url;
        totalCost += imgResult.cost;
      } catch (err) {
        // No AI image providers configured or all failed — hero uses solid bgColor only
        console.log(`[generate-email] No hero image generated (using solid bg):`, (err as Error).message);
      }
    }

    // Generate image block src if missing or placeholder (only with AI providers)
    if (
      block.type === "image" &&
      (!block.props.src || block.props.src.includes("example.com") || block.props.src.includes("placeholder"))
    ) {
      try {
        const imagePrompt = `${input.brandProfile?.brandName ?? "Brand"} product lifestyle image for marketing email.`;
        const imgResult = await generateImage({
          purpose: "product_lifestyle",
          prompt: imagePrompt,
          brandStyle,
          fallbackToStock: false,
        });
        (block.props as Record<string, unknown>).src = imgResult.url;
        totalCost += imgResult.cost;
      } catch (err) {
        // No AI image providers — leave image empty for user to fill
        console.log(`[generate-email] No image generated (placeholder kept):`, (err as Error).message);
      }
    }
  }

  return { blocks: updatedBlocks, totalCost };
}

/**
 * Strip hallucinated image URLs from AI-generated blocks.
 * Keeps only URLs that match known product images from the input.
 */
function sanitizeBlocks(
  blocks: EmailBlock[],
  knownImageUrls: Set<string>,
): EmailBlock[] {
  return blocks.map((block) => {
    const props = { ...block.props } as Record<string, unknown>;

    // Strip hero bgImageSrc unless it matches a known product image
    if (block.type === "hero" && props.bgImageSrc) {
      if (!knownImageUrls.has(props.bgImageSrc as string)) {
        delete props.bgImageSrc;
      }
    }

    // Strip image src unless it matches a known product image
    if (block.type === "image" && props.src) {
      if (!knownImageUrls.has(props.src as string)) {
        props.src = "";
      }
    }

    // Strip header logoSrc — always injected from brand settings
    if (block.type === "header" && props.logoSrc) {
      delete props.logoSrc;
    }

    return { ...block, props } as EmailBlock;
  });
}

/**
 * Generate an email using AI based on brand profile, intent, segment, and context.
 */
export async function generateEmail(input: GenerateEmailInput): Promise<GenerateEmailOutput> {
  const prompt = buildPrompt(input);

  const result = await complete({
    model: input.model,
    task: "generation", // customer-facing copy → frontier when no explicit model is chosen
    workload: "creative",
    harness: input.modelHarness,
    prompt,
    temperature: 0.7,
    jsonMode: true,
  });

  const parsed = JSON.parse(result.content) as {
    subject: string;
    previewText: string;
    blocks: EmailBlock[];
    selectedProductIds: string[];
    reasoning: string;
  };

  // Build set of known product image URLs
  const knownImageUrls = new Set<string>();
  for (const p of input.products) {
    if (p.imageUrl) knownImageUrls.add(p.imageUrl);
  }

  // Strip hallucinated image URLs from AI output
  const sanitizedBlocks = sanitizeBlocks(parsed.blocks, knownImageUrls);

  // Post-process blocks to add AI-generated images (only if providers are configured)
  const { blocks, totalCost } = await postProcessImages(
    sanitizedBlocks,
    input,
    parsed.subject,
  );

  return {
    subject: parsed.subject,
    previewText: parsed.previewText,
    blocks,
    selectedProductIds: parsed.selectedProductIds ?? [],
    reasoning: parsed.reasoning ?? "",
    promptUsed: prompt,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    imageCosts: totalCost,
  };
}
