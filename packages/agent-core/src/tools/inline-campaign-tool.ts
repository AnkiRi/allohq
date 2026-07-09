import { prisma, buildWhereFromConditions } from "@allohq/database";
import type { ToolDefinition } from "../types";

export const inlineCampaignTools: ToolDefinition[] = [
  {
    name: "create_campaign_with_preview",
    description:
      "Create a campaign draft with inline email preview. Use when merchant asks to create/send a campaign, run a sale, or email customers. Target the audience ONE of three ways, in priority order: (1) segmentId — an EXISTING segment already built in this conversation (e.g. one create_segment just returned); pass its id when the merchant says 'campaign for these' / 'for that segment'. (2) customerIds — an EXACT set of people from find_customers (named/specific/'top N' customers); ALWAYS call find_customers first for those. (3) segmentFilter — a broad RFM segment by name (e.g. 'Champions', 'Hibernating'). Never approximate named/specific/top-N customers with a broad segment. Returns HTML preview, subject, and draft campaign ID.",
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
      segmentId: {
        type: "string",
        description: "Id of an EXISTING segment to target (e.g. one create_segment just returned). Use this to run a campaign for a segment already built in this conversation — do NOT rebuild it. Takes precedence over segmentFilter.",
      },
      segmentFilter: {
        type: "string",
        description: "Target RFM segment name (e.g. 'Hibernating', 'Champions'). Use ONLY for broad segment targeting — not for named or specific customers.",
      },
      customerIds: {
        type: "array",
        description: "Exact customer ids (from find_customers) to target EXACTLY these people (e.g. a single customer). Takes precedence over segmentFilter.",
        items: { type: "string" },
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
      const segmentId = params.segmentId ? String(params.segmentId) : undefined;
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

      // Resolve the audience: explicit customers (a manual segment) take
      // precedence over a named RFM segment, so "campaign for Archana" targets
      // exactly Archana, not the nearest broad segment.
      const rawIds = Array.isArray(params.customerIds)
        ? (params.customerIds as unknown[]).map(String).filter(Boolean)
        : [];
      let segment;
      if (rawIds.length > 0) {
        const members = await prisma.customer.findMany({
          where: { id: { in: rawIds }, storeId: ctx.storeId },
          include: { rfmScore: { select: { totalSpent: true } } },
        });
        const memberIds = members.map((m) => m.id);
        const totalRevenue = members.reduce(
          (s, m) => s + (m.rfmScore?.totalSpent ?? 0),
          0,
        );
        const slug = `${campaignName} selected`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .concat(`-${Date.now().toString(36)}`);
        segment = await prisma.customerSegment.create({
          data: {
            storeId: ctx.storeId,
            name: `${campaignName} · selected`,
            slug,
            description: "Customers selected for this campaign",
            kind: "manual",
            customerIds: memberIds,
            customerCount: memberIds.length,
            totalRevenue,
            isSystem: false,
          },
        });
      } else if (segmentId) {
        // Target an EXISTING segment (e.g. one create_segment just returned) by id.
        // This is what "create a campaign for these / for that segment" needs — the
        // segment already holds its customerIds (manual) or conditions.
        segment = await prisma.customerSegment.findFirst({
          where: { id: segmentId, storeId: ctx.storeId },
        });
      } else {
        segment = segmentFilter
          ? await prisma.customerSegment.findFirst({
              where: {
                storeId: ctx.storeId,
                name: { contains: segmentFilter, mode: "insensitive" },
              },
            })
          : null;
      }

      // Real recipient count = EXACTLY what the send worker will target: the same
      // membership resolution + the acceptsMarketing opt-in filter. So the previewed
      // count equals what actually gets sent (no "1,243 previewed / 987 sent" gap).
      let recipientCount = 0;
      if (segment) {
        const seg = segment as { kind?: string; customerIds?: string[]; conditions?: unknown; name: string };
        let recipientWhere: Record<string, unknown>;
        if (seg.kind === "manual") {
          recipientWhere = { storeId: ctx.storeId, id: { in: seg.customerIds ?? [] }, acceptsMarketing: true };
        } else if (seg.kind === "conditions" && seg.conditions) {
          recipientWhere = { ...buildWhereFromConditions(seg.conditions as any, [ctx.storeId]), acceptsMarketing: true };
        } else {
          recipientWhere = { storeId: ctx.storeId, rfmScore: { segment: seg.name }, acceptsMarketing: true };
        }
        recipientCount = await prisma.customer.count({ where: recipientWhere });
      }

      // Don't create a dead campaign that targets nobody. If the audience didn't
      // resolve (no segment matched) or has no opted-in customers, tell the agent
      // exactly how to fix it instead of silently producing a 0-recipient draft.
      if (recipientCount === 0) {
        return {
          success: false,
          message: !segment
            ? "I couldn't tell who to send this to. Target an audience explicitly: pass segmentId for a segment you already built, customerIds (from find_customers) for named/top-N people, or segmentFilter for a broad RFM segment like 'Champions'."
            : `The audience "${(segment as { name?: string }).name ?? "segment"}" has no reachable recipients (0 opted-in customers). Pick a different segment, or check that these customers accept marketing.`,
        };
      }

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

      // Render to HTML for preview — brand-styled via the store's BrandKit
      const { renderBrandedEmail } = await import("@allohq/customer-intelligence");
      const previewHtml = await renderBrandedEmail({
        storeId: store.id,
        blocks: result.blocks as any[],
        subject: result.subject,
        previewText: result.previewText,
        variables: {
          firstName: "Customer",
          storeName: store.storeName ?? store.shopDomain,
          storeUrl: storeUrl,
        },
        previewMode: true,
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
          recipientCount,
          // Freeze what joon PROPOSED (the action bundle) so a later human edit can be
          // diffed against it at approval. Can't-backfill: once the draft is edited in
          // place, the agent's original intent is gone otherwise.
          agentProposal: {
            proposedAt: new Date().toISOString(),
            segmentId: segment?.id ?? null,
            segmentName: segment?.name ?? null,
            channel: "email",
            intent,
            discountPercent: discountPercent ?? null,
            scheduledAt: null,
            recipientCount,
          },
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
        estimatedRecipients: recipientCount,
        segment: segment?.name ?? "All customers",
        message: `Campaign "${campaignName}" created as draft with inline preview. Target: ${segment?.name ?? "All customers"} (${recipientCount} recipients). Subject: "${result.subject}". Review the preview and approve to send.`,
      };
    },
  },
];
