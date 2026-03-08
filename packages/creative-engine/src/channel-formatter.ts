import sharp from "sharp";
import type { ChannelSpec } from "./types";

/** Channel-specific image specifications */
export const CHANNEL_SPECS: Record<string, ChannelSpec> = {
  email: { channel: "email", maxWidth: 600, maxHeight: 600, format: "png", quality: 85 },
  whatsapp: { channel: "whatsapp", maxWidth: 400, maxHeight: 400, format: "jpg", quality: 80 },
  sms: { channel: "sms", maxWidth: 300, maxHeight: 300, format: "jpg", quality: 75 },
  rcs: { channel: "rcs", maxWidth: 500, maxHeight: 500, format: "png", quality: 85 },
};

/**
 * Resize and optimize an image for a specific channel.
 * Returns the processed image buffer.
 */
export async function formatForChannel(
  imageBuffer: Buffer,
  channel: string,
): Promise<{ buffer: Buffer; width: number; height: number; format: string }> {
  const spec = CHANNEL_SPECS[channel] ?? CHANNEL_SPECS["email"]!;

  let pipeline = sharp(imageBuffer).resize(spec.maxWidth, spec.maxHeight, {
    fit: "inside",
    withoutEnlargement: true,
  });

  if (spec.format === "jpg") {
    pipeline = pipeline.jpeg({ quality: spec.quality });
  } else if (spec.format === "webp") {
    pipeline = pipeline.webp({ quality: spec.quality });
  } else {
    pipeline = pipeline.png({ quality: spec.quality });
  }

  const buffer = await pipeline.toBuffer();
  const metadata = await sharp(buffer).metadata();

  return {
    buffer,
    width: metadata.width ?? spec.maxWidth,
    height: metadata.height ?? spec.maxHeight,
    format: spec.format,
  };
}

/**
 * Format an image for all channels and return a map of channel → buffer.
 */
export async function formatForAllChannels(
  imageBuffer: Buffer,
): Promise<Record<string, { buffer: Buffer; width: number; height: number; format: string }>> {
  const results: Record<string, { buffer: Buffer; width: number; height: number; format: string }> = {};

  for (const channel of Object.keys(CHANNEL_SPECS)) {
    results[channel] = await formatForChannel(imageBuffer, channel);
  }

  return results;
}
