import { prisma } from "@allohq/database";
import type { ToolDefinition } from "../types";

export const campaignTools: ToolDefinition[] = [
  {
    name: "create_campaign",
    description:
      "Create an email campaign targeting a specific segment. Creates a draft campaign ready for review. The merchant should review and send it from the dashboard.",
    parameters: {
      name: {
        type: "string",
        description: "Campaign name (e.g. 'Win-Back March 2026')",
      },
      segmentName: {
        type: "string",
        description: "Target segment name (e.g. 'At Risk', 'Champions')",
      },
      templateId: {
        type: "string",
        description: "Optional email template ID to use. If not provided, a default will be selected.",
      },
    },
    handler: async (params, ctx) => {
      const name = String(params.name ?? "Agent Campaign");
      const segmentName = String(params.segmentName ?? "");

      // Find the segment
      const segment = segmentName
        ? await prisma.customerSegment.findFirst({
            where: { storeId: ctx.storeId, name: { contains: segmentName, mode: "insensitive" } },
          })
        : null;

      // Find workspace for the store
      const store = await prisma.store.findFirst({
        where: { id: ctx.storeId },
        select: { workspaceId: true },
      });

      if (!store) {
        return { success: false, message: "Store not found" };
      }

      // Find a template — use provided ID or pick the most recent one
      let templateId = params.templateId ? String(params.templateId) : null;
      if (!templateId) {
        const template = await prisma.emailTemplate.findFirst({
          where: { workspaceId: store.workspaceId },
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        });
        templateId = template?.id ?? null;
      }

      if (!templateId) {
        return {
          success: false,
          message: "No email template found. Create a template first before creating a campaign.",
        };
      }

      const campaign = await prisma.campaign.create({
        data: {
          workspaceId: store.workspaceId,
          storeId: ctx.storeId,
          name,
          templateId,
          segmentId: segment?.id,
          status: "draft",
          recipientCount: segment?.customerCount ?? 0,
        },
      });

      // Log action
      await prisma.agentAction.create({
        data: {
          storeId: ctx.storeId,
          agentType: "retention_strategist",
          actionType: "create_campaign",
          input: { name, segmentName, templateId },
          output: { campaignId: campaign.id },
          status: "completed",
        },
      });

      return {
        success: true,
        campaignId: campaign.id,
        name: campaign.name,
        segment: segment?.name ?? "All customers",
        recipientCount: campaign.recipientCount,
        status: "draft",
        message: `Campaign "${name}" created as draft targeting ${segment?.name ?? "all customers"} (${campaign.recipientCount} recipients). Review and send from the Campaigns page.`,
      };
    },
  },
  {
    name: "edit_template",
    description:
      "Edit an existing email template's subject line, preview text, or name. Use this when the merchant wants to tweak a template.",
    parameters: {
      templateName: { type: "string", description: "Name or partial name of the template to edit" },
      subject: { type: "string", description: "New subject line (optional)" },
      previewText: { type: "string", description: "New preview text (optional)" },
      name: { type: "string", description: "New template name (optional)" },
    },
    handler: async (params, ctx) => {
      const store = await prisma.store.findFirst({
        where: { id: ctx.storeId },
        select: { workspaceId: true },
      });
      if (!store) return { success: false, message: "Store not found" };

      const template = await prisma.emailTemplate.findFirst({
        where: {
          workspaceId: store.workspaceId,
          name: { contains: String(params.templateName ?? ""), mode: "insensitive" },
        },
      });
      if (!template) return { success: false, message: `Template "${params.templateName}" not found` };

      const updates: Record<string, unknown> = {};
      if (params.subject) updates.subject = String(params.subject);
      if (params.previewText) updates.previewText = String(params.previewText);
      if (params.name) updates.name = String(params.name);

      if (Object.keys(updates).length === 0) {
        return { success: false, message: "No updates provided" };
      }

      await prisma.emailTemplate.update({ where: { id: template.id }, data: updates });

      await prisma.agentAction.create({
        data: {
          storeId: ctx.storeId,
          agentType: "retention_strategist",
          actionType: "edit_template",
          input: { templateId: template.id, ...updates },
          output: { success: true },
          status: "completed",
        },
      });

      return {
        success: true,
        templateId: template.id,
        message: `Template "${template.name}" updated successfully.`,
      };
    },
  },

  {
    name: "schedule_campaign",
    description:
      "Schedule a draft campaign to be sent at a specific date and time. The campaign must be in draft status.",
    parameters: {
      campaignName: { type: "string", description: "Name or partial name of the campaign to schedule" },
      scheduledAt: { type: "string", description: "ISO 8601 datetime for when to send (e.g. '2026-03-10T09:00:00Z')" },
    },
    handler: async (params, ctx) => {
      const store = await prisma.store.findFirst({
        where: { id: ctx.storeId },
        select: { workspaceId: true },
      });
      if (!store) return { success: false, message: "Store not found" };

      const campaign = await prisma.campaign.findFirst({
        where: {
          workspaceId: store.workspaceId,
          storeId: ctx.storeId,
          name: { contains: String(params.campaignName ?? ""), mode: "insensitive" },
          status: "draft",
        },
      });
      if (!campaign) return { success: false, message: `Draft campaign "${params.campaignName}" not found` };

      const scheduledAt = new Date(String(params.scheduledAt));
      if (isNaN(scheduledAt.getTime())) return { success: false, message: "Invalid date format" };
      if (scheduledAt < new Date()) return { success: false, message: "Scheduled time must be in the future" };

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { scheduledAt, status: "scheduled" },
      });

      await prisma.agentAction.create({
        data: {
          storeId: ctx.storeId,
          agentType: "retention_strategist",
          actionType: "schedule_campaign",
          input: { campaignId: campaign.id, scheduledAt: scheduledAt.toISOString() },
          output: { success: true },
          status: "completed",
        },
      });

      return {
        success: true,
        campaignId: campaign.id,
        scheduledAt: scheduledAt.toISOString(),
        message: `Campaign "${campaign.name}" scheduled for ${scheduledAt.toLocaleString()}.`,
      };
    },
  },

  {
    name: "generate_campaign_template",
    description:
      "Generate a complete email template from a text description using AI. Creates a ready-to-use template for campaigns.",
    parameters: {
      description: { type: "string", description: "What the email should be about" },
      intent: {
        type: "string",
        description: "Email intent: 'welcome', 'cart_recovery', 'post_purchase', 'win_back', 'seasonal', 'promotion', 're_engagement', 'vip_reward'",
      },
      tone: { type: "string", description: "Optional tone override: e.g. 'friendly', 'urgent', 'premium'" },
    },
    handler: async (params, ctx) => {
      const store = await prisma.store.findFirst({
        where: { id: ctx.storeId },
        select: { id: true, workspaceId: true, shopDomain: true, storeLogoUrl: true, storeName: true, address: true, socialLinks: true },
      });
      if (!store) return { success: false, message: "Store not found" };

      const brandProfile = await prisma.brandProfile.findFirst({
        where: { storeId: ctx.storeId, workspaceId: store.workspaceId },
      });

      const products = await prisma.product.findMany({
        where: { storeId: ctx.storeId, status: "active" },
        take: 10,
        orderBy: { updatedAt: "desc" },
      });

      const { generateEmail } = await import("@allohq/customer-intelligence");

      const intent = String(params.intent ?? "promotion");
      const storeUrl = `https://${store.shopDomain}`;

      const brandSettingsForEmail = brandProfile ? {
        logoUrl: store.storeLogoUrl ?? undefined,
        logoPosition: (brandProfile.logoPosition as "left" | "center" | "right") ?? "center",
        headerBgColor: brandProfile.headerBgColor ?? undefined,
        footerText: brandProfile.footerText ?? undefined,
        showSocialLinks: brandProfile.showSocialLinks,
        showAddress: brandProfile.showAddress,
        storeName: store.storeName ?? brandProfile.brandName,
        address: store.address ? store.address as { address1?: string; city?: string; province?: string; zip?: string; country?: string } : undefined,
        socialLinks: store.socialLinks ? store.socialLinks as Record<string, string> : undefined,
      } : undefined;

      const result = await generateEmail({
        brandProfile: brandProfile ? {
          brandName: brandProfile.brandName,
          brandDescription: brandProfile.brandDescription,
          toneAttributes: brandProfile.toneAttributes as Record<string, string>,
          vocabulary: brandProfile.vocabulary as Record<string, string[]>,
          visualStyle: brandProfile.visualStyle as Record<string, string | string[]>,
          sampleCopy: brandProfile.sampleCopy as string[],
        } : undefined,
        brandSettings: brandSettingsForEmail,
        intent: intent as any,
        creativeIntensity: (brandProfile?.creativeIntensity as any) ?? "balanced",
        toneOverride: params.tone ? String(params.tone) : undefined,
        tweaks: params.description ? String(params.description) : undefined,
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

      await prisma.generatedContent.create({
        data: {
          workspaceId: store.workspaceId,
          templateId: template.id,
          prompt: result.promptUsed,
          response: JSON.stringify(result),
          model: result.model,
          intent,
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
          purpose: "generate_email",
        },
      });

      await prisma.agentAction.create({
        data: {
          storeId: ctx.storeId,
          agentType: "retention_strategist",
          actionType: "generate_campaign_template",
          input: { description: String(params.description ?? ""), intent, tone: String(params.tone ?? "") },
          output: { templateId: template.id, subject: template.subject },
          status: "completed",
        },
      });

      return {
        success: true,
        templateId: template.id,
        subject: template.subject,
        previewText: template.previewText,
        message: `Email template "${template.subject}" generated. Use this template ID with create_campaign to launch a campaign.`,
      };
    },
  },
];
