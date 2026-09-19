import { prisma } from "@allohq/database";
import { createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

function assetStorage() {
  const bucket = process.env["ASSET_BUCKET"];
  const cdnBaseUrl = process.env["ASSET_CDN_BASE_URL"]?.replace(/\/$/, "");
  if (!bucket || !cdnBaseUrl) return null;
  const endpoint = process.env["ASSET_S3_ENDPOINT"];
  return {
    bucket,
    cdnBaseUrl,
    client: new S3Client({
      region: process.env["ASSET_REGION"] ?? process.env["AWS_REGION"] ?? "us-east-1",
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    }),
  };
}

async function persistDerivative(
  storeId: string,
  productId: string,
  name: string,
  body: Buffer,
) {
  const storage = assetStorage();
  if (!storage) return null;
  const checksum = createHash("sha256").update(body).digest("hex");
  const key = `stores/${storeId}/products/${productId}/${name}-${checksum}.png`;
  await storage.client.send(new PutObjectCommand({
    Bucket: storage.bucket,
    Key: key,
    Body: body,
    ContentType: "image/png",
    CacheControl: "public,max-age=31536000,immutable",
    Metadata: { store: storeId, product: productId, sha256: checksum },
  }));
  return `${storage.cdnBaseUrl}/${key}`;
}

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

    // Step 1: Create a "transparent" version by extracting with alpha channel
    // This uses Sharp's built-in capabilities — for true background removal,
    // integrate rembg (Python) or remove.bg API in production
    let transparentBuffer: Buffer;
    try {
      transparentBuffer = await sharp(buffer)
        .resize(600, 600, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    } catch {
      // Fallback: just resize without transparency
      transparentBuffer = await sharp(buffer)
        .resize(600, 600, { fit: "contain" })
        .png()
        .toBuffer();
    }

    // Step 2: Apply brand-colored background
    const brandBgBuffer = await sharp(transparentBuffer)
      .flatten({ background: brandBgColor })
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

      const url = await persistDerivative(storeId, productId, sizeName, resized);
      // Without asset storage, retain Shopify's authoritative durable image;
      // never place multi-megabyte data URLs in the database.
      sizes[sizeName as keyof ImageSizes] = url ?? originalUrl;
    }

    // Upsert processed image record
    const transparentUrl =
      (await persistDerivative(storeId, productId, "transparent", transparentBuffer)) ?? originalUrl;
    const brandBgUrl =
      (await persistDerivative(storeId, productId, "brand-background", brandBgBuffer)) ?? originalUrl;
    await prisma.processedProductImage.upsert({
      where: { productId_storeId: { productId, storeId } },
      create: {
        productId,
        storeId,
        originalUrl,
        transparentUrl,
        brandBgUrl,
        sizes: sizes as any,
        processedAt: new Date(),
      },
      update: {
        originalUrl,
        transparentUrl,
        brandBgUrl,
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
