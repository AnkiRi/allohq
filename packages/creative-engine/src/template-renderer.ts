import mjml2html from "mjml";
import fs from "node:fs";
import path from "node:path";
import type { BrandDesignTokens, ContentSlots, TemplateArchetypeId, TemplateArchetype } from "./types";
import { DEFAULT_BRAND_TOKENS } from "./types";

const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

/** All available template archetypes with metadata */
export const TEMPLATE_ARCHETYPES: TemplateArchetype[] = [
  { id: "hero-story", name: "Hero Story", description: "Full-width hero image, big headline, short body, single CTA", bestFor: ["new_arrival", "seasonal", "newsletter"], requiredSlots: ["headline", "ctaText", "ctaUrl"], optionalSlots: ["heroImageUrl", "bodyText", "subheadline"] },
  { id: "product-spotlight", name: "Product Spotlight", description: "Single product, large image, feature description, CTA", bestFor: ["new_arrival", "repurchase_window", "cross_sell"], requiredSlots: ["products", "ctaText", "ctaUrl"], optionalSlots: ["headline", "bodyText"] },
  { id: "editorial", name: "Editorial", description: "Magazine-style with headline, body text, inline images", bestFor: ["newsletter", "re_engagement"], requiredSlots: ["headline", "bodyText"], optionalSlots: ["heroImageUrl", "ctaText", "ctaUrl"] },
  { id: "product-grid", name: "Product Grid", description: "2x2 or 3x1 product layout with prices", bestFor: ["cross_sell", "new_arrival", "promotion"], requiredSlots: ["products"], optionalSlots: ["headline", "ctaText", "ctaUrl"] },
  { id: "urgency-sale", name: "Urgency/Sale", description: "Bold announcement, product + discount", bestFor: ["promotion", "low_stock", "win_back"], requiredSlots: ["headline", "ctaText", "ctaUrl"], optionalSlots: ["products", "discountCode", "discountPercent", "countdownDate"] },
  { id: "social-proof", name: "Social Proof", description: "Review highlight, customer testimonial", bestFor: ["re_engagement", "cross_sell"], requiredSlots: ["testimonial"], optionalSlots: ["headline", "products", "ctaText", "ctaUrl"] },
  { id: "minimalist-note", name: "Minimalist Note", description: "Text-forward, looks like personal email", bestFor: ["win_back", "at_risk_winback", "re_engagement"], requiredSlots: ["bodyText"], optionalSlots: ["headline", "ctaText", "ctaUrl"] },
  { id: "visual-journey", name: "Visual Journey", description: "Step-by-step with numbered sections and images", bestFor: ["welcome", "post_purchase"], requiredSlots: ["steps"], optionalSlots: ["headline", "ctaText", "ctaUrl"] },
  { id: "celebration-milestone", name: "Celebration/Milestone", description: "Celebratory design, personal stats, reward", bestFor: ["vip_milestone", "at_risk_winback"], requiredSlots: ["headline", "stats"], optionalSlots: ["bodyText", "discountCode", "ctaText", "ctaUrl"] },
  { id: "comparison", name: "Comparison", description: "Side-by-side product comparison", bestFor: ["cross_sell"], requiredSlots: ["products"], optionalSlots: ["headline", "bodyText"] },
  { id: "restock-replenish", name: "Restock/Replenish", description: "Simple reminder with product image and quick-buy", bestFor: ["repurchase_window"], requiredSlots: ["products", "ctaText", "ctaUrl"], optionalSlots: ["headline", "bodyText"] },
  { id: "abandoned-cart", name: "Abandoned Cart", description: "Cart contents, product images, single strong CTA", bestFor: ["abandoned_cart"], requiredSlots: ["products", "ctaText", "ctaUrl"], optionalSlots: ["headline", "bodyText", "discountCode"] },
  { id: "welcome", name: "Welcome", description: "Brand intro, value prop, what to expect", bestFor: ["welcome"], requiredSlots: ["headline", "bodyText", "ctaText", "ctaUrl"], optionalSlots: ["steps", "heroImageUrl"] },
  { id: "thank-you", name: "Thank You/Post-Purchase", description: "Order confirmation + warm brand touch", bestFor: ["post_purchase"], requiredSlots: ["headline", "bodyText"], optionalSlots: ["products", "ctaText", "ctaUrl"] },
  { id: "seasonal-holiday", name: "Seasonal/Holiday", description: "Themed design with seasonal color palette", bestFor: ["seasonal"], requiredSlots: ["headline", "ctaText", "ctaUrl"], optionalSlots: ["heroImageUrl", "bodyText", "products", "discountCode"] },
];

/**
 * Load an MJML template file and substitute brand tokens + content slots.
 */
function loadTemplate(archetypeId: TemplateArchetypeId): string {
  const filePath = path.join(TEMPLATES_DIR, `${archetypeId}.mjml`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template archetype "${archetypeId}" not found at ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Substitute {{token.xyz}} and {{slot.xyz}} placeholders in MJML template.
 */
function substituteVariables(
  mjmlTemplate: string,
  tokens: BrandDesignTokens,
  slots: ContentSlots,
): string {
  let result = mjmlTemplate;

  // Substitute brand tokens: {{token.primaryBackground}} etc.
  for (const [key, value] of Object.entries(tokens)) {
    result = result.replace(new RegExp(`\\{\\{token\\.${key}\\}\\}`, "g"), String(value));
  }

  // Substitute content slots: {{slot.headline}} etc.
  for (const [key, value] of Object.entries(slots)) {
    if (typeof value === "string") {
      result = result.replace(new RegExp(`\\{\\{slot\\.${key}\\}\\}`, "g"), value);
    } else if (typeof value === "number") {
      result = result.replace(new RegExp(`\\{\\{slot\\.${key}\\}\\}`, "g"), String(value));
    }
  }

  // Build product HTML if products are in slots
  if (slots.products && slots.products.length > 0) {
    const productHtml = slots.products.map((p) => `
      <mj-column>
        ${p.processedImageUrl || p.imageUrl ? `<mj-image src="${p.processedImageUrl || p.imageUrl}" alt="${p.title}" width="250px" border-radius="{{token.imageCornerRadius}}" />` : ""}
        <mj-text font-family="{{token.bodyFont}}" font-size="{{token.bodySize}}" color="{{token.textPrimary}}" align="center" font-weight="600">${p.title}</mj-text>
        <mj-text font-family="{{token.bodyFont}}" font-size="{{token.captionSize}}" color="{{token.textSecondary}}" align="center">
          ${p.compareAtPrice ? `<s>${p.compareAtPrice}</s> ` : ""}${p.price}
          ${p.badge ? ` <span style="color: {{token.accentColor}}; font-weight: 700;">${p.badge}</span>` : ""}
        </mj-text>
        <mj-button background-color="{{token.ctaBackground}}" color="{{token.ctaTextColor}}" border-radius="{{token.ctaBorderRadius}}" font-family="{{token.bodyFont}}" href="${p.url}">Shop Now</mj-button>
      </mj-column>
    `).join("");
    result = result.replace(/\{\{slot\.productsHtml\}\}/g, productHtml);

    // Re-substitute any token refs inside product HTML
    for (const [key, value] of Object.entries(tokens)) {
      result = result.replace(new RegExp(`\\{\\{token\\.${key}\\}\\}`, "g"), String(value));
    }
  }

  // Build steps HTML
  if (slots.steps && slots.steps.length > 0) {
    const stepsHtml = slots.steps.map((step, i) => `
      <mj-section>
        <mj-column>
          <mj-text font-family="{{token.headingFont}}" font-size="{{token.h2Size}}" color="{{token.accentColor}}" font-weight="700">${i + 1}. ${step.title}</mj-text>
          <mj-text font-family="{{token.bodyFont}}" font-size="{{token.bodySize}}" color="{{token.textSecondary}}">${step.description}</mj-text>
          ${step.imageUrl ? `<mj-image src="${step.imageUrl}" width="500px" border-radius="{{token.imageCornerRadius}}" />` : ""}
        </mj-column>
      </mj-section>
    `).join("");
    result = result.replace(/\{\{slot\.stepsHtml\}\}/g, stepsHtml);

    for (const [key, value] of Object.entries(tokens)) {
      result = result.replace(new RegExp(`\\{\\{token\\.${key}\\}\\}`, "g"), String(value));
    }
  }

  // Build stats HTML
  if (slots.stats && slots.stats.length > 0) {
    const statsHtml = slots.stats.map((stat) => `
      <mj-column>
        <mj-text font-family="{{token.headingFont}}" font-size="{{token.h1Size}}" color="{{token.accentColor}}" align="center" font-weight="700">${stat.value}</mj-text>
        <mj-text font-family="{{token.bodyFont}}" font-size="{{token.captionSize}}" color="{{token.textMuted}}" align="center">${stat.label}</mj-text>
      </mj-column>
    `).join("");
    result = result.replace(/\{\{slot\.statsHtml\}\}/g, statsHtml);

    for (const [key, value] of Object.entries(tokens)) {
      result = result.replace(new RegExp(`\\{\\{token\\.${key}\\}\\}`, "g"), String(value));
    }
  }

  // Testimonial HTML
  if (slots.testimonial) {
    const t = slots.testimonial;
    const testimonialHtml = `
      <mj-text font-family="{{token.bodyFont}}" font-size="{{token.bodySize}}" color="{{token.textPrimary}}" font-style="italic" padding="20px 40px">"${t.text}"</mj-text>
      <mj-text font-family="{{token.bodyFont}}" font-size="{{token.captionSize}}" color="{{token.textMuted}}" padding="0 40px">— ${t.author}</mj-text>
    `;
    result = result.replace(/\{\{slot\.testimonialHtml\}\}/g, testimonialHtml);

    for (const [key, value] of Object.entries(tokens)) {
      result = result.replace(new RegExp(`\\{\\{token\\.${key}\\}\\}`, "g"), String(value));
    }
  }

  // Clean up any remaining unfilled slots
  result = result.replace(/\{\{slot\.\w+\}\}/g, "");
  result = result.replace(/\{\{token\.\w+\}\}/g, "");

  return result;
}

/**
 * Render an MJML template archetype to responsive HTML.
 */
export function renderMjmlTemplate(
  archetypeId: TemplateArchetypeId,
  brandTokens: BrandDesignTokens,
  contentSlots: ContentSlots,
): string {
  const mjmlTemplate = loadTemplate(archetypeId);
  const populated = substituteVariables(mjmlTemplate, brandTokens, contentSlots);

  const result = mjml2html(populated, {
    validationLevel: "soft",
    minify: true,
  });

  if (result.errors.length > 0) {
    console.warn(`[template-renderer] MJML warnings for ${archetypeId}:`, result.errors.map((e) => e.message));
  }

  return result.html;
}

/**
 * Render a template with placeholder content for merchant preview.
 */
export function previewTemplate(
  archetypeId: TemplateArchetypeId,
  brandTokens?: BrandDesignTokens,
): string {
  const tokens = brandTokens ?? DEFAULT_BRAND_TOKENS;

  const placeholderSlots: ContentSlots = {
    headline: "Your Headline Here",
    subheadline: "A compelling subheadline that grabs attention",
    bodyText: "This is preview body text. Your actual campaign content will appear here with personalized copy written in your brand voice.",
    ctaText: "Shop Now",
    ctaUrl: "#",
    preheaderText: "Preview of your email template",
    unsubscribeUrl: "#",
    products: [
      { id: "1", title: "Product Name", price: "$49.00", compareAtPrice: "$65.00", url: "#", badge: "SALE" },
      { id: "2", title: "Another Product", price: "$35.00", url: "#" },
    ],
    stats: [
      { label: "Orders", value: "12" },
      { label: "Total Spent", value: "$580" },
      { label: "Member Since", value: "2024" },
    ],
    testimonial: { text: "This product changed my daily routine. Absolutely love it!", author: "Happy Customer" },
    steps: [
      { title: "Step One", description: "Getting started is easy" },
      { title: "Step Two", description: "Discover your favourites" },
      { title: "Step Three", description: "Enjoy the experience" },
    ],
  };

  return renderMjmlTemplate(archetypeId, tokens, placeholderSlots);
}

/** List all available template archetypes */
export function listArchetypes(): TemplateArchetype[] {
  return TEMPLATE_ARCHETYPES;
}

/** Get a specific archetype's metadata */
export function getArchetype(id: TemplateArchetypeId): TemplateArchetype | undefined {
  return TEMPLATE_ARCHETYPES.find((a) => a.id === id);
}
