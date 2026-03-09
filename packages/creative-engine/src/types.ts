/** Brand aesthetic classifications */
export type BrandAesthetic =
  | "clean_minimal"
  | "bold_graphic"
  | "luxury_editorial"
  | "warm_organic"
  | "playful_colorful"
  | "tech_modern"
  | "heritage_artisanal"
  | "premium_dtc";

/** Full brand design token set for template parameterization */
export interface BrandDesignTokens {
  // Colors
  primaryBackground: string;
  secondaryBackground: string;
  accentColor: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Typography
  headingFont: string;
  bodyFont: string;
  headingWeight: string;
  h1Size: string;
  h2Size: string;
  bodySize: string;
  captionSize: string;
  lineHeight: string;

  // Spacing
  sectionPadding: string;
  contentPadding: string;

  // CTA
  ctaStyle: "pill" | "rounded" | "square" | "outline";
  ctaBorderRadius: string;
  ctaPadding: string;
  ctaBackground: string;
  ctaTextColor: string;

  // Images
  imageCornerRadius: string;
  productImageBackground: string;

  // Brand
  logoUrl: string;
  logoWidth: string;
  footerStyle: string;
}

/** Template archetype IDs */
export type TemplateArchetypeId =
  | "hero-story"
  | "product-spotlight"
  | "editorial"
  | "product-grid"
  | "urgency-sale"
  | "social-proof"
  | "minimalist-note"
  | "visual-journey"
  | "celebration-milestone"
  | "comparison"
  | "restock-replenish"
  | "abandoned-cart"
  | "welcome"
  | "thank-you"
  | "seasonal-holiday";

/** Content slots that get filled into MJML templates */
export interface ContentSlots {
  headline?: string;
  subheadline?: string;
  bodyText?: string;
  ctaText?: string;
  ctaUrl?: string;
  heroImageUrl?: string;
  products?: ProductSlot[];
  testimonial?: { text: string; author: string; photoUrl?: string };
  stats?: { label: string; value: string }[];
  steps?: { title: string; description: string; imageUrl?: string }[];
  discountCode?: string;
  discountPercent?: number;
  countdownDate?: string;
  unsubscribeUrl?: string;
  preheaderText?: string;
}

/** Product data for template rendering */
export interface ProductSlot {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  processedImageUrl?: string;
  price: string;
  compareAtPrice?: string;
  url: string;
  badge?: string;
  rating?: number;
}

/** Channel-specific image specs */
export interface ChannelSpec {
  channel: string;
  maxWidth: number;
  maxHeight: number;
  format: "png" | "jpg" | "webp";
  quality: number;
}

/** Processed product image sizes */
export interface ImageSizes {
  hero?: string;   // 600x300
  card?: string;   // 280x280
  grid?: string;   // 270x270
  thumb?: string;  // 100x100
  whatsapp?: string; // 400x400
}

/** Overlay variant types */
export interface OverlayConfig {
  type: "discount" | "new_tag" | "price" | "stock_badge" | "star_rating";
  text?: string;
  value?: number;
}

/** Creative asset generation result */
export interface GeneratedAsset {
  imageUrl: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  format: string;
  type: string;
  generationMethod: string;
}

/** Creative asset record (mirrors DB model) */
export interface CreativeAsset {
  id: string;
  storeId: string;
  type: "hero_banner" | "product_card" | "promo_badge" | "background" | "lifestyle";
  generationMethod: "template" | "ai_generated" | "product_composite" | "overlay";
  sourcePrompt?: string;
  templateId?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  format: string;
  channel?: string;
  campaignId?: string;
  metadata?: Record<string, unknown>;
}

/** Visual variant for A/B testing */
export interface VisualVariant {
  id: string;
  label: string;
  archetypeId: TemplateArchetypeId;
  heroImageUrl?: string;
  contentSlots: ContentSlots;
  brandTokenOverrides?: Partial<BrandDesignTokens>;
}

/** Processed product image record (mirrors DB model) */
export interface ProcessedProductImage {
  productId: string;
  storeId: string;
  originalUrl: string;
  transparentUrl?: string;
  brandBgUrl: string;
  sizes: ImageSizes;
  overlayVariants?: Record<string, string>;
  processedAt: Date;
}

/** Template archetype metadata */
export interface TemplateArchetype {
  id: TemplateArchetypeId;
  name: string;
  description: string;
  bestFor: string[];
  requiredSlots: string[];
  optionalSlots: string[];
}

/** Default brand design tokens for fallback */
export const DEFAULT_BRAND_TOKENS: BrandDesignTokens = {
  primaryBackground: "#FFFFFF",
  secondaryBackground: "#F7F7F7",
  accentColor: "#000000",
  textPrimary: "#1A1A1A",
  textSecondary: "#666666",
  textMuted: "#999999",
  headingFont: "Arial, Helvetica, sans-serif",
  bodyFont: "Arial, Helvetica, sans-serif",
  headingWeight: "700",
  h1Size: "32px",
  h2Size: "24px",
  bodySize: "16px",
  captionSize: "12px",
  lineHeight: "1.6",
  sectionPadding: "40px",
  contentPadding: "20px",
  ctaStyle: "rounded",
  ctaBorderRadius: "6px",
  ctaPadding: "14px 28px",
  ctaBackground: "#000000",
  ctaTextColor: "#FFFFFF",
  imageCornerRadius: "8px",
  productImageBackground: "#F5F5F5",
  logoUrl: "",
  logoWidth: "150px",
  footerStyle: "minimal",
};

/** Campaign type to archetype mapping hints */
export const CAMPAIGN_ARCHETYPE_MAP: Record<string, TemplateArchetypeId[]> = {
  win_back: ["minimalist-note", "urgency-sale", "product-spotlight"],
  at_risk_winback: ["minimalist-note", "celebration-milestone"],
  repurchase_window: ["restock-replenish", "product-spotlight"],
  new_arrival: ["product-spotlight", "hero-story", "product-grid"],
  low_stock: ["urgency-sale", "product-spotlight"],
  seasonal: ["seasonal-holiday", "hero-story"],
  vip_milestone: ["celebration-milestone", "hero-story"],
  cross_sell: ["product-grid", "comparison"],
  re_engagement: ["minimalist-note", "hero-story"],
  welcome: ["welcome"],
  abandoned_cart: ["abandoned-cart"],
  post_purchase: ["thank-you"],
  newsletter: ["editorial", "hero-story"],
  promotion: ["urgency-sale", "product-grid"],
};
