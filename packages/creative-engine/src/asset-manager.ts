import { prisma } from "@allohq/database";

interface StoreAssetInput {
  storeId: string;
  type: string;
  generationMethod: string;
  imageUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  fileSizeBytes?: number;
  format?: string;
  channel?: string;
  campaignId?: string;
  sourcePrompt?: string;
  templateId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Store a creative asset record in the database.
 */
export async function storeAsset(input: StoreAssetInput): Promise<string> {
  const asset = await prisma.creativeAsset.create({
    data: {
      storeId: input.storeId,
      type: input.type,
      generationMethod: input.generationMethod,
      imageUrl: input.imageUrl,
      thumbnailUrl: input.thumbnailUrl,
      width: input.width,
      height: input.height,
      fileSizeBytes: input.fileSizeBytes,
      format: input.format,
      channel: input.channel,
      campaignId: input.campaignId,
      sourcePrompt: input.sourcePrompt,
      templateId: input.templateId,
      metadata: input.metadata as any,
    },
  });

  return asset.id;
}

/**
 * Get a creative asset by ID.
 */
export async function getAsset(assetId: string) {
  return prisma.creativeAsset.findUnique({ where: { id: assetId } });
}

/**
 * List creative assets for a store, optionally filtered by type and/or campaign.
 */
export async function listAssets(
  storeId: string,
  options?: { type?: string; campaignId?: string; limit?: number },
) {
  return prisma.creativeAsset.findMany({
    where: {
      storeId,
      ...(options?.type ? { type: options.type } : {}),
      ...(options?.campaignId ? { campaignId: options.campaignId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
  });
}

/**
 * Link an existing asset to a campaign.
 */
export async function linkToCampaign(assetId: string, campaignId: string): Promise<void> {
  await prisma.creativeAsset.update({
    where: { id: assetId },
    data: { campaignId },
  });
}

/**
 * Delete a creative asset.
 */
export async function deleteAsset(assetId: string): Promise<void> {
  await prisma.creativeAsset.delete({ where: { id: assetId } });
}
