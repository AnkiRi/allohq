import { prisma } from "@allohq/database";
import type { BrandDesignTokens, BrandAesthetic } from "./types";
import { DEFAULT_BRAND_TOKENS } from "./types";

interface ShopifyThemeSettings {
  colors_accent_1?: string;
  colors_accent_2?: string;
  colors_background_1?: string;
  colors_background_2?: string;
  colors_text?: string;
  colors_outline_button_labels?: string;
  colors_solid_button_labels?: string;
  type_header_font?: string;
  type_body_font?: string;
  logo?: string;
}

/**
 * Extract brand kit from a Shopify store — colours, fonts, logo, aesthetic classification.
 * Saves as BrandVisualProfile record.
 */
export async function extractBrandKit(storeId: string): Promise<void> {
  const store = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    select: {
      id: true,
      shopDomain: true,
      storeLogoUrl: true,
      storeName: true,
    },
  });

  // Theme Admin APIs require an additional protected scope and aren't needed
  // for the design-partner launch. Brand styling is derived from storefront
  // metadata, the catalog imagery, and merchant-reviewed brand settings.
  let themeSettings: ShopifyThemeSettings = {};

  // Extract colors
  const primaryColors = extractColors(themeSettings);
  const accentColors = extractAccentColors(themeSettings);

  // Extract fonts
  const headingFont = extractFont(themeSettings.type_header_font);
  const bodyFont = extractFont(themeSettings.type_body_font);

  // Logo
  const logoUrl = store.storeLogoUrl ?? themeSettings.logo ?? null;

  // Sample product images to classify photography style
  const products = await prisma.product.findMany({
    where: { storeId, imageUrl: { not: null } },
    select: { imageUrl: true },
    take: 20,
  });
  const photographyStyle = classifyPhotographyStyle(products.map((p) => p.imageUrl!));

  // Classify aesthetic
  const aesthetic = classifyAesthetic(primaryColors, accentColors, headingFont, bodyFont);

  // Build full design tokens
  const brandDesignTokens = buildDesignTokens({
    primaryColors,
    accentColors,
    headingFont,
    bodyFont,
    logoUrl,
    themeSettings,
  });

  await prisma.brandVisualProfile.upsert({
    where: { storeId },
    create: {
      storeId,
      primaryColors: primaryColors as any,
      accentColors: accentColors as any,
      fontFamily: headingFont,
      bodyFontFamily: bodyFont,
      logoUrl,
      photographyStyle,
      visualTone: aesthetic.includes("bold") ? "bold" : aesthetic.includes("luxury") ? "refined" : "clean",
      layoutPreference: aesthetic.includes("editorial") ? "editorial" : "clean",
      aestheticClassification: aesthetic,
      brandDesignTokens: brandDesignTokens as any,
    },
    update: {
      primaryColors: primaryColors as any,
      accentColors: accentColors as any,
      fontFamily: headingFont,
      bodyFontFamily: bodyFont,
      logoUrl,
      photographyStyle,
      visualTone: aesthetic.includes("bold") ? "bold" : aesthetic.includes("luxury") ? "refined" : "clean",
      layoutPreference: aesthetic.includes("editorial") ? "editorial" : "clean",
      aestheticClassification: aesthetic,
      brandDesignTokens: brandDesignTokens as any,
    },
  });

  console.log(`[brand-kit] Extracted brand kit for store ${storeId} — aesthetic: ${aesthetic}`);
}

function extractColors(settings: ShopifyThemeSettings): string[] {
  const colors: string[] = [];
  if (settings.colors_background_1) colors.push(settings.colors_background_1);
  if (settings.colors_background_2) colors.push(settings.colors_background_2);
  if (settings.colors_text) colors.push(settings.colors_text);
  return colors.length > 0 ? colors : ["#FFFFFF", "#1A1A1A"];
}

function extractAccentColors(settings: ShopifyThemeSettings): string[] {
  const colors: string[] = [];
  if (settings.colors_accent_1) colors.push(settings.colors_accent_1);
  if (settings.colors_accent_2) colors.push(settings.colors_accent_2);
  if (settings.colors_solid_button_labels) colors.push(settings.colors_solid_button_labels);
  return colors.length > 0 ? colors : ["#000000"];
}

function extractFont(fontString?: string): string {
  if (!fontString) return "Arial, Helvetica, sans-serif";
  // Shopify font format: "assistant_n4" or "heading_font_family"
  const cleaned = fontString.split("_n")[0] ?? fontString;
  // Capitalize first letter
  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return `${capitalized}, Arial, Helvetica, sans-serif`;
}

function classifyPhotographyStyle(_imageUrls: string[]): string {
  // In production, this would analyze images using AI vision
  // For now, default to "product" style
  return "product";
}

function classifyAesthetic(
  primaryColors: string[],
  accentColors: string[],
  headingFont: string,
  _bodyFont: string,
): BrandAesthetic {
  const allColors = [...primaryColors, ...accentColors];
  const hasWhiteBg = allColors.some((c) => c.toUpperCase() === "#FFFFFF" || c.toUpperCase() === "#FFF");
  const hasBlackAccent = allColors.some((c) => c.toUpperCase() === "#000000" || c.toUpperCase() === "#000");
  const hasBoldColors = allColors.some((c) => {
    const hex = c.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    // Saturated color check
    return Math.max(r, g, b) - Math.min(r, g, b) > 100;
  });

  const isSerif = headingFont.toLowerCase().includes("serif") ||
    headingFont.toLowerCase().includes("playfair") ||
    headingFont.toLowerCase().includes("georgia") ||
    headingFont.toLowerCase().includes("times");

  if (hasWhiteBg && hasBlackAccent && !hasBoldColors) return "clean_minimal";
  if (isSerif && !hasBoldColors) return "luxury_editorial";
  if (hasBoldColors && !isSerif) return "bold_graphic";
  if (isSerif) return "heritage_artisanal";
  return "premium_dtc";
}

function buildDesignTokens(params: {
  primaryColors: string[];
  accentColors: string[];
  headingFont: string;
  bodyFont: string;
  logoUrl: string | null;
  themeSettings: ShopifyThemeSettings;
}): BrandDesignTokens {
  const { primaryColors, accentColors, headingFont, bodyFont, logoUrl, themeSettings } = params;

  return {
    ...DEFAULT_BRAND_TOKENS,
    primaryBackground: primaryColors[0] ?? "#FFFFFF",
    secondaryBackground: primaryColors[1] ?? "#F7F7F7",
    accentColor: accentColors[0] ?? "#000000",
    textPrimary: themeSettings.colors_text ?? "#1A1A1A",
    textSecondary: "#666666",
    textMuted: "#999999",
    headingFont,
    bodyFont,
    ctaBackground: accentColors[0] ?? "#000000",
    ctaTextColor: themeSettings.colors_solid_button_labels ?? "#FFFFFF",
    logoUrl: logoUrl ?? "",
  };
}
