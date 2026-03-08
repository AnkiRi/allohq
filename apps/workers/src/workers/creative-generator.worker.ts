import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import {
  renderMjmlTemplate,
  selectTemplate,
  storeAsset,
} from "@allohq/creative-engine";
import type {
  TemplateArchetypeId,
  ContentSlots,
  BrandDesignTokens,
} from "@allohq/creative-engine";
import { DEFAULT_BRAND_TOKENS } from "@allohq/creative-engine";
import { redisConnection, QUEUE_NAMES } from "../config";

interface CreativeGenJobData {
  storeId: string;
  campaignType: string;
  customerSegment?: string;
  contentSlots: ContentSlots;
  archetypeOverride?: TemplateArchetypeId;
  campaignId?: string;
}

/**
 * Creative generation worker.
 * On-demand: generates email HTML from MJML templates with brand tokens.
 * Called by campaign factory or manual campaign creation.
 */
export const creativeGeneratorWorker = new Worker<CreativeGenJobData>(
  QUEUE_NAMES.CREATIVE_GEN,
  async (job) => {
    const { storeId, campaignType, customerSegment, contentSlots, archetypeOverride, campaignId } = job.data;

    console.log(`[creative-generator] Generating creative for store ${storeId}, type: ${campaignType}`);

    // Load brand visual profile
    const profile = await prisma.brandVisualProfile.findUnique({
      where: { storeId },
    });

    const brandTokens: BrandDesignTokens = profile?.brandDesignTokens
      ? { ...DEFAULT_BRAND_TOKENS, ...(profile.brandDesignTokens as Record<string, string>) }
      : DEFAULT_BRAND_TOKENS;

    const aesthetic = profile?.aestheticClassification ?? undefined;

    // Select template archetype
    const archetypeId = archetypeOverride ?? selectTemplate(campaignType, customerSegment, aesthetic as any);

    // Render MJML → HTML
    const html = renderMjmlTemplate(archetypeId, brandTokens, contentSlots);

    // Store creative asset record
    const assetId = await storeAsset({
      storeId,
      type: "email_template",
      generationMethod: "template",
      imageUrl: "", // No standalone image, it's an HTML email
      templateId: archetypeId,
      campaignId,
      metadata: {
        campaignType,
        customerSegment,
        archetypeId,
        htmlLength: html.length,
      },
    });

    console.log(`[creative-generator] Generated email with archetype "${archetypeId}", asset ${assetId}`);

    return {
      archetypeId,
      html,
      assetId,
      brandTokensUsed: !!profile,
    };
  },
  { connection: redisConnection },
);

creativeGeneratorWorker.on("completed", (job) => {
  console.log(`[creative-generator] Job ${job.id} completed`);
});

creativeGeneratorWorker.on("failed", (job, err) => {
  console.error(`[creative-generator] Job ${job?.id} failed:`, err.message);
});
