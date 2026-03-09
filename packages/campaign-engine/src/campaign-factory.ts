import { prisma } from "@allohq/database";
import { selectTemplate, renderMjmlTemplate } from "@allohq/creative-engine";
import type { ContentSlots, BrandDesignTokens, TemplateArchetypeId } from "@allohq/creative-engine";
import { DEFAULT_BRAND_TOKENS } from "@allohq/creative-engine";
import { routeAction, ActionCategory } from "@allohq/autonomy-engine";
import type { CampaignOpportunity, CampaignDraft } from "./types";

/**
 * Generate a campaign draft from a detected opportunity.
 * 1. Selects template archetype
 * 2. Builds content slots (copy + products)
 * 3. Routes through autonomy engine
 * 4. Returns draft for review or auto-execution
 */
export async function generateCampaignDraft(
  opportunity: CampaignOpportunity,
): Promise<CampaignDraft> {
  const { storeId, type, customerCount, productIds } = opportunity;

  // Load brand profile
  const profile = await prisma.brandVisualProfile.findUnique({
    where: { storeId },
    select: { aestheticClassification: true, brandDesignTokens: true },
  });

  const aesthetic = profile?.aestheticClassification ?? undefined;
  const brandTokens: BrandDesignTokens = profile?.brandDesignTokens
    ? { ...DEFAULT_BRAND_TOKENS, ...(profile.brandDesignTokens as Record<string, string>) }
    : DEFAULT_BRAND_TOKENS;

  // Select template archetype
  const archetypeId = selectTemplate(type, opportunity.segmentName, aesthetic as any);

  // Load products with processed images if available
  const products = productIds && productIds.length > 0
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, title: true, price: true, compareAtPrice: true, handle: true, imageUrl: true },
      })
    : [];

  // Load processed product images (branded backgrounds, multi-size variants)
  const processedImages = products.length > 0
    ? await prisma.processedProductImage.findMany({
        where: { productId: { in: products.map((p) => p.id) }, storeId },
        select: { productId: true, brandBgUrl: true, sizes: true },
      })
    : [];
  const processedImageMap = new Map(processedImages.map((pi) => [pi.productId, pi]));

  // Load store for domain
  const store = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    select: { shopDomain: true, storeName: true },
  });

  // Build content slots (with processed product images)
  const contentSlots = buildContentSlots(type, opportunity, products, store, brandTokens, processedImageMap);

  // Generate campaign name and subject
  const { name, subject } = generateCampaignMeta(type, opportunity, store.storeName ?? "Store");

  // Calculate confidence score based on opportunity quality
  const confidenceScore = calculateConfidence(opportunity);

  // Render MJML template to responsive HTML
  let html: string | undefined;
  try {
    html = renderMjmlTemplate(archetypeId as TemplateArchetypeId, brandTokens, contentSlots);
  } catch (err: any) {
    console.warn(`[campaign-factory] MJML render failed for ${archetypeId}: ${err.message}`);
  }

  const draft: CampaignDraft = {
    storeId,
    opportunity,
    name,
    subject,
    archetypeId,
    targetSegment: opportunity.segmentName ?? type,
    targetCount: customerCount,
    estimatedRevenue: opportunity.estimatedRevenue ?? { low: 0, mid: 0, high: 0, conversionRate: 0, avgOrderValue: 0 },
    confidenceScore,
    reasoning: opportunity.reasoning,
    html,
  };

  // Route through autonomy engine (include HTML preview in payload)
  const category = mapOpportunityToCategory(type);
  await routeAction({
    storeId,
    type: "campaign_send",
    category,
    reasoning: opportunity.reasoning,
    estimatedRevenue: opportunity.estimatedRevenue?.mid,
    payload: {
      draft,
      archetypeId,
      contentSlots,
      subject,
      customerCount,
      name,
      htmlPreview: html,
      targetSegment: { name: opportunity.segmentName ?? type, count: customerCount },
      campaignName: name,
    },
  });

  return draft;
}

function buildContentSlots(
  type: string,
  opportunity: CampaignOpportunity,
  products: { id: string; title: string; price: number; compareAtPrice: number | null; handle: string; imageUrl: string | null }[],
  store: { shopDomain: string },
  _brandTokens: BrandDesignTokens,
  processedImageMap?: Map<string, { productId: string; brandBgUrl: string | null; sizes: unknown }>,
): ContentSlots {
  const productSlots = products.map((p) => {
    const processed = processedImageMap?.get(p.id);
    const sizes = processed?.sizes as Record<string, string> | null;
    return {
      id: p.id,
      title: p.title,
      price: `$${p.price.toFixed(2)}`,
      compareAtPrice: p.compareAtPrice ? `$${p.compareAtPrice.toFixed(2)}` : undefined,
      imageUrl: p.imageUrl ?? undefined,
      processedImageUrl: sizes?.card ?? processed?.brandBgUrl ?? undefined,
      url: `https://${store.shopDomain}/products/${p.handle}`,
    };
  });

  const base: ContentSlots = {
    ctaText: "Shop Now",
    ctaUrl: `https://${store.shopDomain}`,
    unsubscribeUrl: "{{unsubscribe_url}}",
    preheaderText: "",
    products: productSlots.length > 0 ? productSlots : undefined,
  };

  switch (type) {
    case "at_risk_winback":
      return {
        ...base,
        headline: "We miss you, {{first_name}}!",
        bodyText: "It's been a while since your last visit. We've got something special waiting for you.",
        ctaText: "Come Back & Save",
        preheaderText: "We've saved something special for you",
      };
    case "repurchase_window":
      return {
        ...base,
        headline: "Time to restock?",
        bodyText: "Based on your previous order, you might be running low. Reorder with one click.",
        ctaText: "Reorder Now",
        preheaderText: "Your favourites might be running low",
      };
    case "new_arrival":
      return {
        ...base,
        headline: "Just Dropped",
        subheadline: "New arrivals you won't want to miss",
        bodyText: "We've added fresh picks to our collection. Be the first to shop.",
        ctaText: "Shop New Arrivals",
        preheaderText: "New products just landed",
      };
    case "vip_milestone":
      return {
        ...base,
        headline: "You're a VIP, {{first_name}}!",
        bodyText: "Thank you for being one of our most valued customers. Here's an exclusive reward.",
        ctaText: "Claim Your Reward",
        preheaderText: "A special thank you from us",
        stats: [
          { label: "Orders", value: "{{order_count}}" },
          { label: "Total Spent", value: "{{ltv}}" },
          { label: "Member Since", value: "{{last_order_date}}" },
        ],
      };
    case "re_engagement":
      return {
        ...base,
        headline: "Still there, {{first_name}}?",
        bodyText: "We haven't seen you in a while and we'd love to have you back. Here's a little something to welcome you.",
        ctaText: "Explore What's New",
        preheaderText: "It's been too long!",
      };
    case "cross_sell":
      return {
        ...base,
        headline: "You might also love these",
        bodyText: "Based on your recent purchase, we think you'll love these picks.",
        ctaText: "Discover More",
        preheaderText: "Curated picks just for you",
      };
    default:
      return {
        ...base,
        headline: opportunity.reasoning.slice(0, 60),
        bodyText: opportunity.reasoning,
        preheaderText: opportunity.reasoning.slice(0, 100),
      };
  }
}

function generateCampaignMeta(
  type: string,
  opportunity: CampaignOpportunity,
  storeName: string,
): { name: string; subject: string } {
  const date = new Date().toISOString().slice(0, 10);

  switch (type) {
    case "at_risk_winback":
      return {
        name: `Win-Back — ${opportunity.customerCount} at-risk (${date})`,
        subject: `We miss you, {{first_name}}! Come back to ${storeName}`,
      };
    case "repurchase_window":
      return {
        name: `Restock Reminder (${date})`,
        subject: "Time to restock? Your favourites are waiting",
      };
    case "new_arrival":
      return {
        name: `New Arrivals Announcement (${date})`,
        subject: `Just in: New arrivals at ${storeName}`,
      };
    case "vip_milestone":
      return {
        name: `VIP Recognition — ${opportunity.customerCount} VIPs (${date})`,
        subject: "You're a VIP! Here's your exclusive reward",
      };
    case "re_engagement":
      return {
        name: `Re-engagement — ${opportunity.customerCount} inactive (${date})`,
        subject: `It's been a while, {{first_name}} — we have something for you`,
      };
    default:
      return {
        name: `${type} Campaign (${date})`,
        subject: `Something special from ${storeName}`,
      };
  }
}

function calculateConfidence(opportunity: CampaignOpportunity): number {
  let score = 50;

  // Higher customer count = higher confidence
  if (opportunity.customerCount > 100) score += 15;
  else if (opportunity.customerCount > 20) score += 10;
  else if (opportunity.customerCount < 5) score -= 15;

  // Revenue estimate boosts confidence
  if (opportunity.estimatedRevenue) {
    if (opportunity.estimatedRevenue.mid > 1000) score += 15;
    else if (opportunity.estimatedRevenue.mid > 200) score += 10;
  }

  // Win-backs and repurchase windows are well-understood patterns
  if (opportunity.type === "repurchase_window") score += 10;
  if (opportunity.type === "at_risk_winback") score += 5;

  return Math.min(100, Math.max(0, score));
}

function mapOpportunityToCategory(type: string): ActionCategory {
  switch (type) {
    case "at_risk_winback": return ActionCategory.WIN_BACK;
    case "repurchase_window": return ActionCategory.REPURCHASE;
    case "new_arrival": return ActionCategory.PROMOTIONAL;
    case "low_stock": return ActionCategory.PROMOTIONAL;
    case "seasonal": return ActionCategory.PROMOTIONAL;
    case "vip_milestone": return ActionCategory.VIP;
    case "cross_sell": return ActionCategory.CROSS_SELL;
    case "re_engagement": return ActionCategory.WIN_BACK;
    default: return ActionCategory.PROMOTIONAL;
  }
}
