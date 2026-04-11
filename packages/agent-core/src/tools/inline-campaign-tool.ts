import { prisma } from "@allohq/database";
import type { ToolDefinition } from "../types";

export const inlineCampaignTools: ToolDefinition[] = [
  {
    name: "create_campaign_with_preview",
    description:
      "Create a campaign draft with inline email preview. Use when merchant asks to create/send a campaign, run a sale, or email customers. Returns HTML preview, subject, and draft campaign ID.",
    parameters: {
      campaignName: {
        type: "string",
        description: "Campaign name (e.g. 'Flash Sale March 2026')",
      },
      intent: {
        type: "string",
        description:
          "Campaign intent: 'flash_sale', 'promotion', 'announcement', 'win_back', 'vip_reward', 'custom'",
      },
      segmentFilter: {
        type: "string",
        description: "Target segment name or description (e.g. 'Hibernating', 'Champions')",
      },
      discountPercent: {
        type: "number",
        description: "Discount percentage to include in the email (e.g. 15)",
      },
      productIds: {
        type: "array",
        description: "Array of product IDs to feature in the email",
        items: { type: "string" },
      },
      customInstructions: {
        type: "string",
        description: "Custom instructions for email content generation",
      },
    },
    handler: async (params, ctx) => {
      const campaignName = String(params.campaignName ?? "AI Campaign");
      const intent = String(params.intent ?? "promotion");
      const segmentFilter = params.segmentFilter ? String(params.segmentFilter) : undefined;
      const discountPercent = params.discountPercent ? Number(params.discountPercent) : undefined;
      const customInstructions = params.customInstructions ? String(params.customInstructions) : undefined;

      // Find the store and workspace
      const store = await prisma.store.findFirst({
        where: { id: ctx.storeId },
        select: {
          id: true,
          workspaceId: true,
          shopDomain: true,
          storeLogoUrl: true,
          storeName: true,
          address: true,
          socialLinks: true,
        },
      });
      if (!store) return { success: false, message: "Store not found" };

      // Find target segment
      const segment = segmentFilter
        ? await prisma.customerSegment.findFirst({
            where: {
              storeId: ctx.storeId,
              name: { contains: segmentFilter, mode: "insensitive" },
            },
          })
        : null;

      // Fetch brand profile
      const brandProfile = await prisma.brandProfile.findFirst({
        where: { storeId: ctx.storeId, workspaceId: store.workspaceId },
      });

      // Fetch products to feature
      let products;
      if (params.productIds && Array.isArray(params.productIds) && params.productIds.length > 0) {
        products = await prisma.product.findMany({
          where: {
            storeId: ctx.storeId,
            id: { in: params.productIds.map(String) },
          },
        });
      } else {
        products = await prisma.product.findMany({
          where: { storeId: ctx.storeId, status: "active" },
          take: 6,
          orderBy: { updatedAt: "desc" },
        });
      }

      // Map intent to email generation intent
      const intentMap: Record<string, string> = {
        flash_sale: "promotion",
        promotion: "promotion",
        announcement: "promotion",
        win_back: "win_back",
        vip_reward: "vip_reward",
        custom: "promotion",
      };
      const emailIntent = intentMap[intent] ?? "promotion";

      // Build tweaks/description for the email generator
      const tweakParts: string[] = [];
      if (customInstructions) tweakParts.push(customInstructions);
      if (discountPercent) tweakParts.push(`Include a ${discountPercent}% discount offer prominently.`);
      if (intent === "flash_sale") tweakParts.push("This is a flash sale — create urgency with limited time messaging.");
      if (intent === "announcement") tweakParts.push("This is an announcement — focus on news, not selling.");
      if (intent === "vip_reward") tweakParts.push("This is for VIP customers — make them feel special and exclusive.");
      if (intent === "win_back") tweakParts.push("This is a win-back campaign — acknowledge their absence, offer an incentive to return.");

      const storeUrl = `https://${store.shopDomain}`;

      // Build brand settings for email generation
      const brandSettingsForEmail = brandProfile
        ? {
            logoUrl: store.storeLogoUrl ?? undefined,
            logoPosition: (brandProfile.logoPosition as "left" | "center" | "right") ?? "center",
            headerBgColor: brandProfile.headerBgColor ?? undefined,
            footerText: brandProfile.footerText ?? undefined,
            showSocialLinks: brandProfile.showSocialLinks,
            showAddress: brandProfile.showAddress,
            storeName: store.storeName ?? brandProfile.brandName,
            address: store.address
              ? (store.address as {
                  address1?: string;
                  city?: string;
                  province?: string;
                  zip?: string;
                  country?: string;
                })
              : undefined,
            socialLinks: store.socialLinks
              ? (store.socialLinks as Record<string, string>)
              : undefined,
          }
        : undefined;

      // Generate email content
      const { generateEmail } = await import("@allohq/customer-intelligence");

      const result = await generateEmail({
        brandProfile: brandProfile
          ? {
              brandName: brandProfile.brandName,
              brandDescription: brandProfile.brandDescription,
              toneAttributes: brandProfile.toneAttributes as Record<string, string>,
              vocabulary: brandProfile.vocabulary as Record<string, string[]>,
              visualStyle: brandProfile.visualStyle as Record<string, string | string[]>,
              sampleCopy: brandProfile.sampleCopy as string[],
            }
          : undefined,
        brandSettings: brandSettingsForEmail,
        intent: emailIntent as any,
        creativeIntensity: (brandProfile?.creativeIntensity as any) ?? "balanced",
        tweaks: tweakParts.length > 0 ? tweakParts.join(" ") : undefined,
        products: products.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description ?? undefined,
          imageUrl: p.imageUrl ?? undefined,
          price: p.price,
          handle: p.handle,
        })),
        storeUrl,
      });

      // Create the template
      const template = await prisma.emailTemplate.create({
        data: {
          workspaceId: store.workspaceId,
          name: result.subject,
          subject: result.subject,
          previewText: result.previewText,
          blocks: result.blocks as any,
          category: "ai_generated",
        },
      });

      // Render to HTML for preview
      const { renderToHtml } = require("@allohq/email-builder/src/server") as any;
      const previewHtml = renderToHtml(result.blocks as any[], {
        variables: {
          firstName: "Customer",
          storeName: store.storeName ?? store.shopDomain,
          storeUrl: storeUrl,
        },
        previewMode: true,
        brandSettings: brandSettingsForEmail as any,
      });

      // Create the draft campaign
      const campaign = await prisma.campaign.create({
        data: {
          workspaceId: store.workspaceId,
          storeId: ctx.storeId,
          name: campaignName,
          templateId: template.id,
          segmentId: segment?.id,
          status: "draft",
          recipientCount: segment?.customerCount ?? 0,
        },
      });

      // Record token usage
      await prisma.generatedContent.create({
        data: {
          workspaceId: store.workspaceId,
          templateId: template.id,
          prompt: result.promptUsed,
          response: JSON.stringify(result),
          model: result.model,
          intent: emailIntent,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      });

      await prisma.tokenUsage.create({
        data: {
          workspaceId: store.workspaceId,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          purpose: "inline_campaign_preview",
        },
      });

      // Log action
      await prisma.agentAction.create({
        data: {
          storeId: ctx.storeId,
          agentType: "retention_strategist",
          actionType: "create_campaign_with_preview",
          input: {
            campaignName,
            intent,
            segmentFilter,
            discountPercent,
          },
          output: {
            campaignId: campaign.id,
            templateId: template.id,
            subject: result.subject,
          },
          status: "completed",
        },
      });

      return {
        success: true,
        contentType: "campaign_preview",
        previewHtml,
        subject: result.subject,
        previewText: result.previewText,
        campaignName,
        draftCampaignId: campaign.id,
        templateId: template.id,
        estimatedRecipients: segment?.customerCount ?? 0,
        segment: segment?.name ?? "All customers",
        message: `Campaign "${campaignName}" created as draft with inline preview. Target: ${segment?.name ?? "All customers"} (${segment?.customerCount ?? 0} recipients). Subject: "${result.subject}". Review the preview and approve to send.`,
      };
    },
  },
];
