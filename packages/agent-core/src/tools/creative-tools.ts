import { prisma } from "@allohq/database";
import {
  selectTemplate,
  renderMjmlTemplate,
  processProductImageById,
  storeAsset,
  listArchetypes,
} from "@allohq/creative-engine";
import type { BrandDesignTokens, ContentSlots, BrandAesthetic } from "@allohq/creative-engine";
import { estimateRevenue } from "@allohq/campaign-engine";
import type { OpportunityType } from "@allohq/campaign-engine";
import type { ToolDefinition } from "../types";

export const creativeTools: ToolDefinition[] = [
  {
    name: "generate_campaign_visual",
    description:
      "Generate a campaign email visual using the MJML template system. Selects the best template archetype for the campaign type and renders it with the store's brand tokens. Returns the rendered HTML and archetype used.",
    parameters: {
      campaign_type: {
        type: "string",
        description:
          "Type of campaign: win_back, new_product, repurchase, seasonal, vip, cross_sell, cart_recovery, welcome, post_purchase, re_engagement",
      },
      customer_segment: {
        type: "string",
        description:
          "Target customer segment: at_risk, champion, loyal, new, lost, vip, all",
      },
      headline: { type: "string", description: "Main headline for the email" },
      body_text: { type: "string", description: "Body text content" },
      cta_text: { type: "string", description: "Call-to-action button text" },
      cta_url: { type: "string", description: "Call-to-action URL" },
    },
    handler: async (params, ctx) => {
      const profile = await prisma.brandVisualProfile.findUnique({
        where: { storeId: ctx.storeId },
      });

      if (!profile) {
        return { error: "Brand profile not found. Run brand kit extraction first." };
      }

      const brandTokens = (profile.brandDesignTokens ?? {}) as unknown as BrandDesignTokens;
      const aesthetic = (profile.aestheticClassification ?? "clean_minimal") as BrandAesthetic;

      const campaignType = (params.campaign_type as string) ?? "promotional";
      const segment = (params.customer_segment as string) ?? "all";

      const archetype = selectTemplate(campaignType, segment, aesthetic);

      const contentSlots: ContentSlots = {
        headline: (params.headline as string) ?? "",
        bodyText: (params.body_text as string) ?? "",
        ctaText: (params.cta_text as string) ?? "Shop Now",
        ctaUrl: (params.cta_url as string) ?? "#",
      };

      const html = renderMjmlTemplate(archetype, brandTokens, contentSlots);

      const assetId = await storeAsset({
        storeId: ctx.storeId,
        type: "hero_banner",
        generationMethod: "template",
        imageUrl: "",
        templateId: archetype,
        channel: "email",
        metadata: { campaignType, segment },
      });

      return {
        archetypeUsed: archetype,
        htmlPreview: html.substring(0, 2000),
        assetId,
        availableArchetypes: listArchetypes().map((a) => a.id),
      };
    },
  },

  {
    name: "estimate_campaign_revenue",
    description:
      "Estimate the revenue potential of a campaign targeting a specific segment. Returns low, mid, and high revenue estimates based on historical conversion rates and segment size.",
    parameters: {
      segment_size: {
        type: "number",
        description: "Number of customers in the target segment",
      },
      opportunity_type: {
        type: "string",
        description:
          "Type: at_risk_winback, repurchase_window, new_arrival, low_stock, seasonal, vip_milestone, cross_sell, re_engagement",
      },
    },
    handler: async (params, ctx) => {
      const segmentSize = (params.segment_size as number) ?? 0;
      const opportunityType = (params.opportunity_type as string) ?? "new_arrival";

      if (segmentSize <= 0) {
        return { error: "segment_size must be a positive number" };
      }

      const estimate = await estimateRevenue(
        ctx.storeId,
        segmentSize,
        opportunityType as OpportunityType,
      );
      return estimate;
    },
  },

  {
    name: "generate_product_showcase",
    description:
      "Process a product image with brand-colored background, shadow effects, and optional overlay badges. Creates multi-size variants for different channels (email, WhatsApp, SMS).",
    parameters: {
      product_id: { type: "string", description: "The product ID to process" },
      overlay: {
        type: "string",
        description:
          "Optional overlay type: discount_badge, new_tag, price_label, stock_badge, star_rating",
      },
      overlay_value: {
        type: "string",
        description: "Overlay value (e.g., '20% OFF' for discount_badge, '4.8' for star_rating)",
      },
    },
    handler: async (params, ctx) => {
      const productId = params.product_id as string;
      if (!productId) return { error: "product_id is required" };

      const product = await prisma.product.findFirst({
        where: { id: productId, storeId: ctx.storeId },
      });
      if (!product) return { error: "Product not found" };

      try {
        const result = await processProductImageById(ctx.storeId, productId);
        return {
          success: true,
          productId,
          productTitle: product.title,
          processedImage: result,
        };
      } catch (err) {
        return { error: `Failed to process product image: ${(err as Error).message}` };
      }
    },
  },

  {
    name: "generate_visual_variants",
    description:
      "Generate A/B visual variants for split testing. Creates two different template renderings of the same content for the same campaign, allowing performance comparison.",
    parameters: {
      campaign_type: {
        type: "string",
        description: "Type of campaign for template selection",
      },
      headline_a: { type: "string", description: "Headline for variant A" },
      headline_b: { type: "string", description: "Headline for variant B" },
      body_text: { type: "string", description: "Shared body text" },
      cta_text: { type: "string", description: "Shared CTA text" },
      cta_url: { type: "string", description: "Shared CTA URL" },
    },
    handler: async (params, ctx) => {
      const profile = await prisma.brandVisualProfile.findUnique({
        where: { storeId: ctx.storeId },
      });
      if (!profile) {
        return { error: "Brand profile not found. Run brand kit extraction first." };
      }

      const brandTokens = (profile.brandDesignTokens ?? {}) as unknown as BrandDesignTokens;
      const aesthetic = (profile.aestheticClassification ?? "clean_minimal") as BrandAesthetic;
      const campaignType = (params.campaign_type as string) ?? "promotional";

      const archetypeA = selectTemplate(campaignType, "all", aesthetic);
      const archetypeB = selectTemplate(campaignType, "loyal", aesthetic);

      const slotsA: ContentSlots = {
        headline: (params.headline_a as string) ?? "",
        bodyText: (params.body_text as string) ?? "",
        ctaText: (params.cta_text as string) ?? "Shop Now",
        ctaUrl: (params.cta_url as string) ?? "#",
      };

      const slotsB: ContentSlots = {
        ...slotsA,
        headline: (params.headline_b as string) ?? "",
      };

      const htmlA = renderMjmlTemplate(archetypeA, brandTokens, slotsA);
      const htmlB = renderMjmlTemplate(archetypeB, brandTokens, slotsB);

      return {
        variantA: {
          archetype: archetypeA,
          headline: slotsA.headline,
          htmlPreview: htmlA.substring(0, 1500),
        },
        variantB: {
          archetype: archetypeB,
          headline: slotsB.headline,
          htmlPreview: htmlB.substring(0, 1500),
        },
      };
    },
  },
];
