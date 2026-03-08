import sharp from "sharp";
import type { BrandDesignTokens, OverlayConfig } from "./types";

/**
 * Add a text-based overlay badge to an image using Sharp's composite.
 * Uses SVG text rendering for cross-platform compatibility.
 */
async function addTextOverlay(
  imageBuffer: Buffer,
  text: string,
  position: "top-right" | "top-left" | "bottom-right" | "bottom-left",
  bgColor: string,
  textColor: string,
): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 280;
  const height = metadata.height ?? 280;

  const badgeWidth = Math.min(Math.max(text.length * 10 + 20, 60), width - 10);
  const badgeHeight = 28;

  const x = position.includes("right") ? width - badgeWidth - 8 : 8;
  const y = position.includes("bottom") ? height - badgeHeight - 8 : 8;

  const svgOverlay = Buffer.from(`
    <svg width="${width}" height="${height}">
      <rect x="${x}" y="${y}" width="${badgeWidth}" height="${badgeHeight}" rx="4" ry="4" fill="${bgColor}" />
      <text x="${x + badgeWidth / 2}" y="${y + badgeHeight / 2 + 5}" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="${textColor}" text-anchor="middle">${escapeXml(text)}</text>
    </svg>
  `);

  return sharp(imageBuffer)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Add a discount badge (e.g., "20% OFF") */
export async function addDiscountBadge(
  imageBuffer: Buffer,
  discountText: string,
  tokens: BrandDesignTokens,
): Promise<Buffer> {
  return addTextOverlay(imageBuffer, discountText, "top-right", tokens.accentColor, tokens.ctaTextColor);
}

/** Add a "NEW" tag */
export async function addNewTag(
  imageBuffer: Buffer,
  tokens: BrandDesignTokens,
): Promise<Buffer> {
  return addTextOverlay(imageBuffer, "NEW", "top-left", tokens.accentColor, tokens.ctaTextColor);
}

/** Add a price label */
export async function addPriceLabel(
  imageBuffer: Buffer,
  price: string,
  _tokens: BrandDesignTokens,
): Promise<Buffer> {
  return addTextOverlay(imageBuffer, price, "bottom-left", "rgba(0,0,0,0.7)", "#FFFFFF");
}

/** Add a stock urgency badge (e.g., "Only 3 left") */
export async function addStockBadge(
  imageBuffer: Buffer,
  text: string,
  _tokens: BrandDesignTokens,
): Promise<Buffer> {
  return addTextOverlay(imageBuffer, text, "bottom-right", "#D32F2F", "#FFFFFF");
}

/** Add star rating display */
export async function addStarRating(
  imageBuffer: Buffer,
  rating: number,
  _tokens: BrandDesignTokens,
): Promise<Buffer> {
  const stars = "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating));
  return addTextOverlay(imageBuffer, stars, "bottom-left", "rgba(0,0,0,0.7)", "#FFD700");
}

/** Apply overlay based on config */
export async function applyOverlay(
  imageBuffer: Buffer,
  config: OverlayConfig,
  tokens: BrandDesignTokens,
): Promise<Buffer> {
  switch (config.type) {
    case "discount":
      return addDiscountBadge(imageBuffer, config.text ?? "SALE", tokens);
    case "new_tag":
      return addNewTag(imageBuffer, tokens);
    case "price":
      return addPriceLabel(imageBuffer, config.text ?? "", tokens);
    case "stock_badge":
      return addStockBadge(imageBuffer, config.text ?? "Low stock", tokens);
    case "star_rating":
      return addStarRating(imageBuffer, config.value ?? 5, tokens);
  }
}
