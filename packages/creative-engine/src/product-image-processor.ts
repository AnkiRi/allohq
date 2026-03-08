import { prisma } from "@allohq/database";
import sharp from "sharp";
import type { ImageSizes } from "./types";

interface ProcessImageOptions {
  storeId: string;
  productId: string;
  originalUrl: string;
  brandBgColor?: string;
}

/** Size specifications for multi-size export */
const SIZE_SPECS = {
  hero: { width: 600, height: 300 },
  card: { width: 280, height: 280 },
  grid: { width: 270, height: 270 },
  thumb: { width: 100, height: 100 },
  whatsapp: { width: 400, height: 400 },
} as const;

/**
 * Process a single product image:
 * 1. Download original
 * 2. Smart crop + center
 * 3. Apply brand background color
 * 4. Generate multi-size variants
 * 5. Save as ProcessedProductImage
 */
export async function processProductImage(options: ProcessImageOptions): Promise<void> {
  const { storeId, productId, originalUrl, brandBgColor = "#F5F5F5" } = options;

  try {
    // Download original image
    const response = await fetch(originalUrl);
    if (!response.ok) {
      console.warn(`[product-image] Failed to download ${originalUrl}: ${response.status}`);
      return;
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    // Process: center crop with brand background
    const brandBgBuffer = await sharp(buffer)
      .resize(600, 600, { fit: "contain", background: brandBgColor })
      .png()
      .toBuffer();

    // Generate multi-size variants
    const sizes: ImageSizes = {};
    for (const [sizeName, spec] of Object.entries(SIZE_SPECS)) {
      const resized = await sharp(brandBgBuffer)
        .resize(spec.width, spec.height, { fit: "cover" })
        .png({ quality: 85 })
        .toBuffer();

      // In production, upload to CDN and get URL back
      // For now, store base64 data URL (to be replaced with CDN upload)
      const dataUrl = `data:image/png;base64,${resized.toString("base64")}`;
      sizes[sizeName as keyof ImageSizes] = dataUrl;
    }

    // Upsert processed image record
    await prisma.processedProductImage.upsert({
      where: { productId_storeId: { productId, storeId } },
      create: {
        productId,
        storeId,
        originalUrl,
        brandBgUrl: `data:image/png;base64,${brandBgBuffer.toString("base64")}`,
        sizes: sizes as any,
        processedAt: new Date(),
      },
      update: {
        originalUrl,
        brandBgUrl: `data:image/png;base64,${brandBgBuffer.toString("base64")}`,
        sizes: sizes as any,
        processedAt: new Date(),
      },
    });

    console.log(`[product-image] Processed image for product ${productId}`);
  } catch (err) {
    console.error(`[product-image] Error processing ${productId}:`, err);
  }
}

/**
 * Process all product images for a store.
 * Fetches brand background color from BrandVisualProfile.
 */
export async function processAllProductImages(storeId: string): Promise<{ processed: number; failed: number }> {
  const profile = await prisma.brandVisualProfile.findUnique({
    where: { storeId },
    select: { brandDesignTokens: true },
  });

  const tokens = profile?.brandDesignTokens as Record<string, string> | null;
  const brandBgColor = tokens?.productImageBackground ?? "#F5F5F5";

  const products = await prisma.product.findMany({
    where: { storeId, imageUrl: { not: null } },
    select: { id: true, imageUrl: true },
  });

  let processed = 0;
  let failed = 0;

  for (const product of products) {
    try {
      await processProductImage({
        storeId,
        productId: product.id,
        originalUrl: product.imageUrl!,
        brandBgColor,
      });
      processed++;
    } catch {
      failed++;
    }
  }

  console.log(`[product-image] Store ${storeId}: ${processed} processed, ${failed} failed`);
  return { processed, failed };
}

/**
 * Process a single product image by product ID (used after webhooks).
 */
export async function processProductImageById(storeId: string, productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { imageUrl: true },
  });

  if (!product?.imageUrl) return;

  const profile = await prisma.brandVisualProfile.findUnique({
    where: { storeId },
    select: { brandDesignTokens: true },
  });

  const tokens = profile?.brandDesignTokens as Record<string, string> | null;
  const brandBgColor = tokens?.productImageBackground ?? "#F5F5F5";

  await processProductImage({
    storeId,
    productId,
    originalUrl: product.imageUrl,
    brandBgColor,
  });
}
