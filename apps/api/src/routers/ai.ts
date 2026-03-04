import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { Queue } from "bullmq";

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

const brandAnalysisQueue = new Queue("brand-analysis", { connection: redisConnection });

/** Common words to skip when searching for customer names in messages */
const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one",
  "our", "out", "day", "get", "has", "him", "his", "how", "its", "may", "new", "now", "old",
  "see", "way", "who", "did", "let", "say", "she", "too", "use", "what", "why", "how",
  "show", "tell", "find", "give", "last", "make", "want", "with", "from", "they", "been",
  "have", "this", "that", "will", "your", "about", "which", "their", "there", "these",
  "create", "build", "send", "campaign", "automation", "email", "segment", "customer",
  "customers", "template", "analyze", "analysis", "report", "data", "store", "order",
  "orders", "revenue", "spent", "days", "month", "week", "year", "risk", "high", "low",
]);

const aiModelSchema = z.enum([
  "claude-sonnet-4-5-20250929",
  "gpt-4o",
  "gpt-4o-mini",
]).optional();

const emailIntentSchema = z.enum([
  "welcome",
  "cart_recovery",
  "post_purchase",
  "win_back",
  "seasonal",
  "promotion",
  "re_engagement",
  "browse_abandonment",
  "vip_reward",
]);

export const aiRouter = router({
  /** Aggregated insights for the AI panel */
  panelInsights: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
        select: { id: true, shopDomain: true, platform: true, lastSyncAt: true, _count: { select: { customers: true } } },
      });

      if (!store) {
        return {
          store: null,
          metrics: { totalCustomers: 0, revenueThisMonth: 0, revenueLastMonth: 0, revenueTrend: 0, totalAutomations: 0, activeAutomations: 0 },
          segmentAlerts: { atRiskCount: 0, championsCount: 0, newCustomersCount: 0, lostCount: 0 },
          churnAlert: { highRiskCount: 0, avgChurnProbability: 0 },
          storeState: { hasStore: false, hasSyncedData: false, hasBrandProfile: false, hasAutomations: false, hasActiveAutomations: false, hasCampaigns: false },
          topAutomation: null,
        };
      }

      const now = new Date();
      const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const [
        revenueThisMonth,
        revenueLastMonth,
        segmentCounts,
        churnData,
        automations,
        campaigns,
        brandProfile,
        topAutomation,
      ] = await Promise.all([
        // Revenue this month
        ctx.prisma.order.aggregate({
          where: { storeId: input.storeId, createdAt: { gte: startOfThisMonth } },
          _sum: { totalPrice: true },
        }),
        // Revenue last month
        ctx.prisma.order.aggregate({
          where: { storeId: input.storeId, createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } },
          _sum: { totalPrice: true },
        }),
        // Segment counts from RFM scores
        ctx.prisma.rfmScore.groupBy({
          by: ["segment"],
          where: { customer: { storeId: input.storeId } },
          _count: true,
        }),
        // Churn risk from LTV data
        ctx.prisma.customerLifetimeValue.aggregate({
          where: {
            customer: { storeId: input.storeId },
            churnProbability: { gt: 0.6 },
          },
          _count: true,
          _avg: { churnProbability: true },
        }),
        // Automation counts
        ctx.prisma.automation.findMany({
          where: { storeId: input.storeId },
          select: { status: true },
        }),
        // Campaign count
        ctx.prisma.campaign.count({
          where: { workspaceId: ctx.workspaceId },
        }),
        // Brand profile check
        ctx.prisma.brandProfile.findFirst({
          where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
          select: { id: true },
        }),
        // Most recent active/ready automation
        ctx.prisma.automation.findFirst({
          where: { storeId: input.storeId, status: { in: ["active", "ready"] } },
          orderBy: { updatedAt: "desc" },
          select: { name: true, status: true, category: true },
        }),
      ]);

      const thisMonth = revenueThisMonth._sum.totalPrice ?? 0;
      const lastMonth = revenueLastMonth._sum.totalPrice ?? 0;
      const revenueTrend = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : 0;

      const segmentMap = Object.fromEntries(segmentCounts.map((s) => [s.segment, s._count]));

      return {
        store: { domain: store.shopDomain, lastSyncAt: store.lastSyncAt?.toISOString() ?? null },
        metrics: {
          totalCustomers: store._count.customers,
          revenueThisMonth: thisMonth,
          revenueLastMonth: lastMonth,
          revenueTrend,
          totalAutomations: automations.length,
          activeAutomations: automations.filter((a) => a.status === "active").length,
        },
        segmentAlerts: {
          atRiskCount: (segmentMap["At Risk"] ?? 0) as number,
          championsCount: (segmentMap["Champions"] ?? 0) as number,
          newCustomersCount: (segmentMap["New Customers"] ?? 0) as number,
          lostCount: (segmentMap["Lost"] ?? 0) as number,
        },
        churnAlert: {
          highRiskCount: churnData._count ?? 0,
          avgChurnProbability: Math.round((churnData._avg.churnProbability ?? 0) * 100),
        },
        storeState: {
          hasStore: true,
          hasSyncedData: store._count.customers > 0,
          hasBrandProfile: !!brandProfile,
          hasAutomations: automations.length > 0,
          hasActiveAutomations: automations.some((a) => a.status === "active"),
          hasCampaigns: campaigns > 0,
        },
        topAutomation: topAutomation
          ? { name: topAutomation.name, status: topAutomation.status, category: topAutomation.category ?? "" }
          : null,
      };
    }),

  /** List available AI models with cost/tier metadata */
  models: workspaceProcedure.query(async () => {
    const { AI_MODELS } = await import("@allohq/customer-intelligence");
    return AI_MODELS.map((m) => ({
      ...m,
      available:
        (m.provider === "anthropic" && !!process.env["ANTHROPIC_API_KEY"]) ||
        (m.provider === "openai" && !!process.env["OPENAI_API_KEY"]),
    }));
  }),

  /** Get available layout templates for email generation */
  layoutTemplates: workspaceProcedure.query(async () => {
    const { LAYOUT_TEMPLATES } = await import("@allohq/customer-intelligence");
    return LAYOUT_TEMPLATES;
  }),

  /** Get workspace AI settings */
  getSettings: workspaceProcedure.query(async ({ ctx }) => {
    const workspace = await ctx.prisma.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: { defaultModel: true },
    });
    return { defaultModel: workspace?.defaultModel ?? null };
  }),

  /** Set workspace default AI model */
  setDefaultModel: workspaceProcedure
    .input(z.object({ model: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.workspace.update({
        where: { id: ctx.workspaceId },
        data: { defaultModel: input.model },
      });
      return { success: true };
    }),

  /** Generate an email template using AI */
  generateEmail: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        intent: emailIntentSchema,
        model: aiModelSchema,
        segmentId: z.string().optional(),
        context: z
          .object({
            festivity: z.string().optional(),
            discount: z
              .object({
                type: z.enum(["percentage", "fixed"]),
                value: z.number(),
                code: z.string(),
              })
              .optional(),
            funnelStage: z.enum(["awareness", "consideration", "purchase", "retention", "advocacy"]).optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch store for URL + metadata
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      const storeUrl = `https://${store.shopDomain}`;

      // Fetch brand profile (with hard params)
      const brandProfile = await ctx.prisma.brandProfile.findFirst({
        where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
      });

      // Fetch segment if provided
      const segment = input.segmentId
        ? await ctx.prisma.customerSegment.findUnique({ where: { id: input.segmentId } })
        : null;

      // Fetch top products for this store
      const products = await ctx.prisma.product.findMany({
        where: { storeId: input.storeId, status: "active" },
        take: 10,
        orderBy: { updatedAt: "desc" },
      });

      // Import the generator dynamically (it lives in customer-intelligence)
      const { generateEmail } = await import("@allohq/customer-intelligence");

      // Build brand settings for header/footer injection
      const brandSettingsForEmail = brandProfile ? {
        logoUrl: store.storeLogoUrl,
        logoPosition: (brandProfile.logoPosition as "left" | "center" | "right") ?? "center",
        headerBgColor: brandProfile.headerBgColor,
        footerText: brandProfile.footerText,
        showSocialLinks: brandProfile.showSocialLinks,
        showAddress: brandProfile.showAddress,
        storeName: store.storeName ?? brandProfile.brandName,
        address: store.address as { address1?: string; city?: string; province?: string; zip?: string; country?: string } | null,
        socialLinks: store.socialLinks as Record<string, string> | null,
      } : undefined;

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
        intent: input.intent,
        model: input.model,
        creativeIntensity: (brandProfile?.creativeIntensity as "text_heavy" | "balanced" | "visual_heavy") ?? "balanced",
        segment: segment ? { name: segment.name, description: segment.description ?? "" } : undefined,
        products: products.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description ?? undefined,
          imageUrl: p.imageUrl ?? undefined,
          price: p.price,
          handle: p.handle,
        })),
        storeUrl,
        context: input.context,
      });

      // Save generated template
      const template = await ctx.prisma.emailTemplate.create({
        data: {
          workspaceId: ctx.workspaceId,
          name: result.subject,
          subject: result.subject,
          previewText: result.previewText,
          blocks: result.blocks as any,
          category: "ai_generated",
        },
      });

      // Save audit trail
      await ctx.prisma.generatedContent.create({
        data: {
          workspaceId: ctx.workspaceId,
          templateId: template.id,
          prompt: result.promptUsed,
          response: JSON.stringify(result),
          model: result.model,
          intent: input.intent,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      });

      // Record token usage
      await ctx.prisma.tokenUsage.create({
        data: {
          workspaceId: ctx.workspaceId,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          purpose: "generate_email",
        },
      });

      return { template, reasoning: result.reasoning, selectedProductIds: result.selectedProductIds, model: result.model };
    }),

  /** Regenerate email with full override support (model, intensity, tone, layout, feedback) */
  regenerateEmail: workspaceProcedure
    .input(
      z.object({
        templateId: z.string(),
        storeId: z.string(),
        feedback: z.string().optional(),
        model: aiModelSchema,
        creativeIntensity: z.enum(["text_heavy", "balanced", "visual_heavy"]).optional(),
        toneOverride: z.string().optional(),
        layoutTemplate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Load existing template + generation context
      const [template, existing, store, brandProfile] = await Promise.all([
        ctx.prisma.emailTemplate.findFirst({
          where: { id: input.templateId, workspaceId: ctx.workspaceId },
        }),
        ctx.prisma.generatedContent.findFirst({
          where: { templateId: input.templateId, workspaceId: ctx.workspaceId },
          orderBy: { createdAt: "desc" },
        }),
        ctx.prisma.store.findFirst({
          where: { id: input.storeId, workspaceId: ctx.workspaceId },
        }),
        ctx.prisma.brandProfile.findFirst({
          where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
        }),
      ]);

      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });

      const storeUrl = `https://${store.shopDomain}`;

      // Fetch products for the store
      const products = await ctx.prisma.product.findMany({
        where: { storeId: input.storeId, status: "active" },
        take: 10,
        orderBy: { updatedAt: "desc" },
      });

      // Build feedback/tweaks from user input and current blocks
      const tweakParts: string[] = [];
      if (input.feedback) tweakParts.push(input.feedback);
      if (template.blocks) {
        tweakParts.push(`Here is the current email structure (JSON blocks): ${JSON.stringify(template.blocks).slice(0, 2000)}`);
        tweakParts.push("Improve upon this existing email based on the feedback above. Keep what works, change what's requested.");
      }

      const brandSettingsForEmail = brandProfile ? {
        logoUrl: store.storeLogoUrl,
        logoPosition: (brandProfile.logoPosition as "left" | "center" | "right") ?? "center",
        headerBgColor: brandProfile.headerBgColor,
        footerText: brandProfile.footerText,
        showSocialLinks: brandProfile.showSocialLinks,
        showAddress: brandProfile.showAddress,
        storeName: store.storeName ?? brandProfile.brandName,
        address: store.address as { address1?: string; city?: string; province?: string; zip?: string; country?: string } | null,
        socialLinks: store.socialLinks as Record<string, string> | null,
      } : undefined;

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
        intent: (existing?.intent as any) ?? "promotion",
        model: input.model,
        creativeIntensity: input.creativeIntensity ?? (brandProfile?.creativeIntensity as any) ?? "balanced",
        layoutTemplate: input.layoutTemplate,
        toneOverride: input.toneOverride,
        tweaks: tweakParts.join("\n"),
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

      // Save audit trail (don't overwrite template — let frontend accept/reject)
      await ctx.prisma.generatedContent.create({
        data: {
          workspaceId: ctx.workspaceId,
          templateId: input.templateId,
          prompt: result.promptUsed,
          response: JSON.stringify(result),
          model: result.model,
          intent: existing?.intent ?? "promotion",
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      });

      // Record token usage
      await ctx.prisma.tokenUsage.create({
        data: {
          workspaceId: ctx.workspaceId,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          purpose: "regenerate_email",
        },
      });

      return {
        blocks: result.blocks,
        subject: result.subject,
        previewText: result.previewText,
        reasoning: result.reasoning,
        model: result.model,
      };
    }),

  /** Submit feedback on generated content */
  feedback: workspaceProcedure
    .input(
      z.object({
        generatedContentId: z.string(),
        rating: z.enum(["good", "bad", "edited"]),
        editedContent: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const content = await ctx.prisma.generatedContent.findFirst({
        where: { id: input.generatedContentId, workspaceId: ctx.workspaceId },
      });
      if (!content) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.contentFeedback.create({
        data: {
          generatedContentId: input.generatedContentId,
          rating: input.rating,
          editedContent: input.editedContent,
        },
      });
    }),

  /** Get brand profile for a store */
  brandProfile: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.brandProfile.findFirst({
        where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
      });
    }),

  /** Trigger brand analysis */
  analyzeBrand: workspaceProcedure
    .input(z.object({ storeId: z.string(), model: aiModelSchema }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND" });

      const job = await brandAnalysisQueue.add(
        "analyze-brand",
        { storeId: input.storeId, model: input.model },
        { attempts: 2, backoff: { type: "exponential", delay: 5000 } }
      );
      return { status: "queued" as const, jobId: job.id };
    }),

  /** Check brand profile existence and settings for a store */
  brandProfileStatus: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const profile = await ctx.prisma.brandProfile.findFirst({
        where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
        select: { id: true, analyzedAt: true, creativeIntensity: true },
      });
      return {
        exists: !!profile,
        analyzedAt: profile?.analyzedAt ?? undefined,
        creativeIntensity: profile?.creativeIntensity ?? undefined,
      };
    }),

  /** Update creative intensity preference */
  updateCreativeIntensity: workspaceProcedure
    .input(z.object({
      storeId: z.string(),
      creativeIntensity: z.enum(["text_heavy", "balanced", "visual_heavy"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.brandProfile.findFirst({
        where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Brand profile not found. Run brand analysis first." });

      return ctx.prisma.brandProfile.update({
        where: { id: profile.id },
        data: { creativeIntensity: input.creativeIntensity },
      });
    }),

  /** AI chat — real conversational AI with full store context */
  chat: workspaceProcedure
    .input(z.object({
      storeId: z.string(),
      message: z.string().min(1).max(2000),
      chatId: z.string().optional(),
      history: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
        select: { id: true, shopDomain: true, platform: true, lastSyncAt: true },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });

      // ---------------------------------------------------------------
      // 1. Fetch comprehensive store context in parallel
      // ---------------------------------------------------------------
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Pre-search: extract potential names/terms from message to find relevant customers
      const searchTerms = input.message
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));

      const [
        allCustomers,
        segments,
        automations,
        campaigns,
        recentOrders,
        revenueThisMonth,
        brandProfile,
        searchedCustomers,
        tokenUsageRecords,
      ] = await Promise.all([
        // Top 100 customers with RFM + LTV
        ctx.prisma.customer.findMany({
          where: { storeId: input.storeId },
          include: {
            rfmScore: { select: { segment: true, recency: true, frequency: true, monetary: true, totalScore: true, totalSpent: true, orderCount: true, avgOrderValue: true, lastOrderAt: true } },
            lifetimeValue: { select: { historicalLtv: true, predictedLtv: true, churnProbability: true, purchaseFrequency: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 150,
        }),
        // All segments
        ctx.prisma.customerSegment.findMany({
          where: { storeId: input.storeId },
          select: { name: true, customerCount: true, totalRevenue: true, description: true },
          orderBy: { customerCount: "desc" },
        }),
        // All automations
        ctx.prisma.automation.findMany({
          where: { storeId: input.storeId },
          select: { name: true, status: true, category: true, description: true },
        }),
        // All campaigns
        ctx.prisma.campaign.findMany({
          where: { workspaceId: ctx.workspaceId },
          select: { name: true, status: true, recipientCount: true, openCount: true, clickCount: true, sentAt: true },
          orderBy: { updatedAt: "desc" },
          take: 20,
        }),
        // Recent orders (last 30 days)
        ctx.prisma.order.findMany({
          where: { storeId: input.storeId, createdAt: { gte: thirtyDaysAgo } },
          include: { customer: { select: { firstName: true, lastName: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        // Revenue this month
        ctx.prisma.order.aggregate({
          where: { storeId: input.storeId, createdAt: { gte: startOfMonth } },
          _sum: { totalPrice: true },
          _count: true,
        }),
        // Brand profile
        ctx.prisma.brandProfile.findFirst({
          where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
          select: { brandName: true, brandDescription: true },
        }),
        // Name-based search for customers mentioned in the message
        searchTerms.length > 0
          ? ctx.prisma.customer.findMany({
              where: {
                storeId: input.storeId,
                OR: searchTerms.flatMap((term) => [
                  { firstName: { contains: term, mode: "insensitive" as const } },
                  { lastName: { contains: term, mode: "insensitive" as const } },
                  { email: { contains: term, mode: "insensitive" as const } },
                ]),
              },
              include: {
                rfmScore: { select: { segment: true, totalSpent: true, orderCount: true, avgOrderValue: true, lastOrderAt: true, recency: true, frequency: true, monetary: true } },
                lifetimeValue: { select: { historicalLtv: true, predictedLtv: true, churnProbability: true } },
                orders: { select: { orderNumber: true, totalPrice: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5 },
              },
              take: 10,
            })
          : Promise.resolve([]),
        // Token usage stats
        ctx.prisma.tokenUsage.groupBy({
          by: ["model"],
          where: { workspaceId: ctx.workspaceId },
          _sum: { inputTokens: true, outputTokens: true },
          _count: { id: true },
        }),
      ]);

      // ---------------------------------------------------------------
      // 2. Build store context for the system prompt
      // ---------------------------------------------------------------
      const totalCustomers = allCustomers.length;
      const segmentBreakdown = segments.map((s) => `${s.name}: ${s.customerCount} customers, $${Math.round(s.totalRevenue).toLocaleString()} revenue`).join("\n");

      const topCustomers = [...allCustomers]
        .sort((a, b) => (b.rfmScore?.totalSpent ?? 0) - (a.rfmScore?.totalSpent ?? 0))
        .slice(0, 30)
        .map((c) => {
          const rfm = c.rfmScore;
          const ltv = c.lifetimeValue;
          return `- ${c.firstName ?? ""} ${c.lastName ?? ""} (${c.email}) | Segment: ${rfm?.segment ?? "Unknown"} | Spent: $${rfm?.totalSpent?.toFixed(2) ?? "0"} | Orders: ${rfm?.orderCount ?? 0} | AOV: $${rfm?.avgOrderValue?.toFixed(2) ?? "0"} | Last order: ${rfm?.lastOrderAt?.toISOString().split("T")[0] ?? "Never"} | Churn risk: ${ltv ? Math.round(ltv.churnProbability * 100) + "%" : "N/A"} | Predicted LTV: $${ltv?.predictedLtv?.toFixed(0) ?? "N/A"}`;
        })
        .join("\n");

      const searchResults = searchedCustomers.length > 0
        ? "\n\n--- SEARCH RESULTS (customers matching terms in user's message) ---\n" +
          searchedCustomers.map((c) => {
            const rfm = c.rfmScore;
            const ltv = c.lifetimeValue;
            const orders = c.orders.map((o) => `  Order #${o.orderNumber}: $${o.totalPrice} (${o.status}) on ${o.createdAt.toISOString().split("T")[0]}`).join("\n");
            return `CUSTOMER: ${c.firstName ?? ""} ${c.lastName ?? ""}\n  Email: ${c.email}\n  Phone: ${c.phone ?? "N/A"}\n  Tags: ${c.tags.join(", ") || "None"}\n  Segment: ${rfm?.segment ?? "Unknown"}\n  RFM Score: R${rfm?.recency ?? 0}/F${rfm?.frequency ?? 0}/M${rfm?.monetary ?? 0} (Total: ${rfm?.totalSpent?.toFixed(2) ?? "0"})\n  Orders: ${rfm?.orderCount ?? 0} | AOV: $${rfm?.avgOrderValue?.toFixed(2) ?? "0"}\n  Last Order: ${rfm?.lastOrderAt?.toISOString().split("T")[0] ?? "Never"}\n  Historical LTV: $${ltv?.historicalLtv?.toFixed(0) ?? "0"} | Predicted LTV: $${ltv?.predictedLtv?.toFixed(0) ?? "0"}\n  Churn Probability: ${ltv ? Math.round(ltv.churnProbability * 100) + "%" : "N/A"}\n  Recent Orders:\n${orders || "  None"}`;
          }).join("\n\n")
        : "";

      const automationList = automations.length > 0
        ? automations.map((a) => `- ${a.name} (${a.status}) — ${a.category}`).join("\n")
        : "No automations created yet.";

      const campaignList = campaigns.length > 0
        ? campaigns.map((c) => `- ${c.name} (${c.status}) | Recipients: ${c.recipientCount} | Opens: ${c.openCount} | Clicks: ${c.clickCount}${c.sentAt ? ` | Sent: ${c.sentAt.toISOString().split("T")[0]}` : ""}`).join("\n")
        : "No campaigns created yet.";

      const recentOrderList = recentOrders.slice(0, 20).map((o) =>
        `- Order #${o.orderNumber}: $${o.totalPrice} by ${o.customer.firstName ?? ""} ${o.customer.lastName ?? ""} (${o.customer.email}) on ${o.createdAt.toISOString().split("T")[0]}`
      ).join("\n");

      // Token usage summary
      const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
        "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
        "gpt-4o": { input: 2.5, output: 10 },
        "gpt-4o-mini": { input: 0.15, output: 0.6 },
      };
      let totalTokenCalls = 0;
      let totalTokenInput = 0;
      let totalTokenOutput = 0;
      let totalTokenCost = 0;
      const tokenByModel = tokenUsageRecords.map((g) => {
        const inp = g._sum.inputTokens ?? 0;
        const out = g._sum.outputTokens ?? 0;
        const calls = g._count.id;
        const costs = TOKEN_COSTS[g.model] ?? { input: 0, output: 0 };
        const cost = (inp / 1_000_000) * costs.input + (out / 1_000_000) * costs.output;
        totalTokenCalls += calls;
        totalTokenInput += inp;
        totalTokenOutput += out;
        totalTokenCost += cost;
        return `- ${g.model}: ${calls} calls, ${inp.toLocaleString()} input tokens, ${out.toLocaleString()} output tokens, $${cost.toFixed(4)} cost`;
      }).join("\n");

      const storeContext = `
STORE: ${store.shopDomain}
Platform: ${store.platform}
Last data sync: ${store.lastSyncAt?.toISOString() ?? "Never"}
Brand: ${brandProfile ? `${brandProfile.brandName} — ${brandProfile.brandDescription ?? ""}` : "No brand profile yet"}

METRICS:
- Total customers: ${totalCustomers}
- Revenue this month: $${(revenueThisMonth._sum.totalPrice ?? 0).toFixed(2)}
- Orders this month: ${revenueThisMonth._count}

CUSTOMER SEGMENTS:
${segmentBreakdown || "No segments calculated yet."}

TOP CUSTOMERS (by spend):
${topCustomers || "No customer data yet."}
${searchResults}

AUTOMATIONS:
${automationList}

CAMPAIGNS:
${campaignList}

RECENT ORDERS (last 30 days):
${recentOrderList || "No recent orders."}

AI TOKEN USAGE (all time):
- Total API calls: ${totalTokenCalls}
- Total input tokens: ${totalTokenInput.toLocaleString()}
- Total output tokens: ${totalTokenOutput.toLocaleString()}
- Total AI cost: $${totalTokenCost.toFixed(4)}
By model:
${tokenByModel || "No token usage recorded yet."}
`.trim();

      // ---------------------------------------------------------------
      // 4. Call Agent (tool-calling LLM with real capabilities)
      // ---------------------------------------------------------------
      const { runMerchantAgent } = await import("@allohq/agent-core");

      const agentResult = await runMerchantAgent({
        storeId: input.storeId,
        message: input.message,
        conversationHistory: input.history,
        storeContext: storeContext,
      });

      // ---------------------------------------------------------------
      // 5. Format response for UI
      // ---------------------------------------------------------------
      let reply = agentResult.response;

      // Build highlights from tool call outputs
      const highlights: { label: string; value: string }[] = [];
      for (const tc of agentResult.toolCalls) {
        const out = tc.output as Record<string, unknown>;
        if (tc.name === "get_dashboard_metrics" && out) {
          if (out.totalRevenue) highlights.push({ label: "Revenue", value: `$${Number(out.totalRevenue).toLocaleString()}` });
          if (out.orderCount) highlights.push({ label: "Orders", value: String(out.orderCount) });
          if (out.totalCustomers) highlights.push({ label: "Customers", value: String(out.totalCustomers) });
        }
        if (tc.name === "get_churn_risk_report" && Array.isArray(out)) {
          highlights.push({ label: "At Risk", value: `${out.length} customers` });
        }
      }

      // Generate follow-ups based on tool calls made
      const suggestedFollowUps: string[] = [];
      const toolNames = agentResult.toolCalls.map((t) => t.name);
      if (toolNames.includes("get_dashboard_metrics")) {
        suggestedFollowUps.push("Show me who's about to churn");
        suggestedFollowUps.push("Compare to last month");
      }
      if (toolNames.includes("get_churn_risk_report")) {
        suggestedFollowUps.push("Create a win-back campaign for them");
        suggestedFollowUps.push("Send them personalized offers");
      }
      if (toolNames.includes("search_products")) {
        suggestedFollowUps.push("Show me top sellers this month");
      }
      if (suggestedFollowUps.length === 0) {
        suggestedFollowUps.push("Show me the dashboard overview");
        suggestedFollowUps.push("Who are my top customers?");
        suggestedFollowUps.push("Any customers at churn risk?");
      }

      // Detect if agent wants to create something (from response text)
      let actionResult: {
        intent: string;
        success: boolean;
        summary: string;
        created: {
          automationId?: string;
          campaignId?: string;
          templateIds?: string[];
          segmentId?: string;
        };
      } | null = null;

      // If agent's response mentions creating something, try to execute via instruction system
      const createPatterns = [
        { pattern: /(?:create|build|set up) (?:a |an )?(?:win.?back|re.?engagement) (?:automation|flow|campaign)/i, type: "create_automation" },
        { pattern: /(?:create|build|set up) (?:a |an )?campaign/i, type: "create_campaign" },
        { pattern: /(?:create|build|set up) (?:a |an )?segment/i, type: "create_segment" },
      ];

      // Check if user explicitly asked to create something
      const userAskedToCreate = createPatterns.some((p) => p.pattern.test(input.message));
      if (userAskedToCreate) {
        const matchedPattern = createPatterns.find((p) => p.pattern.test(input.message));
        if (matchedPattern) {
          try {
            const { parseInstruction, executeInstruction } = await import("@allohq/customer-intelligence");

            const parsedInstruction = await parseInstruction(input.message, {
              page: "dashboard",
              existingSegments: segments.map((s) => s.name),
              existingAutomations: automations.map((a) => a.name),
            });

            const execResult = await executeInstruction(parsedInstruction, {
              prisma: ctx.prisma as any,
              storeId: input.storeId,
              workspaceId: ctx.workspaceId,
              brandProfile: brandProfile ? {
                brandName: brandProfile.brandName,
                brandDescription: brandProfile.brandDescription ?? undefined,
                toneAttributes: {} as Record<string, string>,
                vocabulary: {} as Record<string, string[]>,
                visualStyle: {} as Record<string, string | string[]>,
                sampleCopy: [],
              } : undefined,
            });

            actionResult = {
              intent: execResult.intent,
              success: execResult.success,
              summary: execResult.summary,
              created: execResult.created,
            };

            if (execResult.tokenUsage.input > 0) {
              await ctx.prisma.tokenUsage.create({
                data: {
                  workspaceId: ctx.workspaceId,
                  model: execResult.tokenUsage.model,
                  inputTokens: execResult.tokenUsage.input,
                  outputTokens: execResult.tokenUsage.output,
                  purpose: "chat_action",
                },
              });
            }
          } catch (err) {
            console.error("[AI Chat] Action execution failed:", err);
            reply += "\n\n*(Note: I tried to execute the action but encountered an error. Please try again or use the specific feature page.)*";
          }
        }
      }

      // Record chat token usage
      await ctx.prisma.tokenUsage.create({
        data: {
          workspaceId: ctx.workspaceId,
          model: "claude-sonnet-4-5-20250929",
          inputTokens: agentResult.inputTokens,
          outputTokens: agentResult.outputTokens,
          purpose: "chat",
        },
      });

      // ---------------------------------------------------------------
      // 7. Persist chat messages to DB
      // ---------------------------------------------------------------
      let chatId = input.chatId;

      if (!chatId) {
        // Create a new chat with title from first message
        const chat = await ctx.prisma.aiChat.create({
          data: {
            workspaceId: ctx.workspaceId,
            storeId: input.storeId,
            title: input.message.slice(0, 60) + (input.message.length > 60 ? "..." : ""),
          },
        });
        chatId = chat.id;
      } else {
        // Touch the updatedAt timestamp
        await ctx.prisma.aiChat.update({
          where: { id: chatId },
          data: { updatedAt: new Date() },
        }).catch(() => {});
      }

      // Save user message and assistant reply
      await ctx.prisma.aiChatMessage.createMany({
        data: [
          {
            chatId,
            role: "user",
            content: input.message,
          },
          {
            chatId,
            role: "assistant",
            content: reply,
            highlights: highlights.length > 0 ? highlights : undefined,
            model: "claude-sonnet-4-5-20250929",
          },
        ],
      });

      return {
        chatId,
        reply,
        highlights,
        suggestedFollowUps: suggestedFollowUps.slice(0, 4),
        action: actionResult,
        model: "claude-sonnet-4-5-20250929",
        toolCalls: agentResult.toolCalls.map((t) => t.name),
      };
    }),

  /** Execute a natural language instruction */
  executeInstruction: workspaceProcedure
    .input(z.object({
      instruction: z.string().min(5).max(1000),
      pageContext: z.string().default("dashboard"),
      storeId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });

      // Fetch context for the instruction parser
      const [segments, automations, brandProfile] = await Promise.all([
        ctx.prisma.customerSegment.findMany({
          where: { storeId: input.storeId },
          select: { name: true },
        }),
        ctx.prisma.automation.findMany({
          where: { storeId: input.storeId },
          select: { name: true },
        }),
        ctx.prisma.brandProfile.findFirst({
          where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
        }),
      ]);

      const { parseInstruction, executeInstruction } = await import("@allohq/customer-intelligence");

      // Parse the instruction
      const parsed = await parseInstruction(
        input.instruction,
        {
          page: input.pageContext,
          existingSegments: segments.map((s) => s.name),
          existingAutomations: automations.map((a) => a.name),
        },
      );

      // Execute the parsed instruction
      const result = await executeInstruction(parsed, {
        prisma: ctx.prisma as any,
        storeId: input.storeId,
        workspaceId: ctx.workspaceId,
        brandProfile: brandProfile ? {
          brandName: brandProfile.brandName,
          brandDescription: brandProfile.brandDescription,
          toneAttributes: brandProfile.toneAttributes as Record<string, string>,
          vocabulary: brandProfile.vocabulary as Record<string, string[]>,
          visualStyle: brandProfile.visualStyle as Record<string, string | string[]>,
          sampleCopy: brandProfile.sampleCopy as string[],
          creativeIntensity: brandProfile.creativeIntensity ?? undefined,
        } : undefined,
      });

      // Record token usage if any
      if (result.tokenUsage.input > 0) {
        await ctx.prisma.tokenUsage.create({
          data: {
            workspaceId: ctx.workspaceId,
            model: result.tokenUsage.model,
            inputTokens: result.tokenUsage.input,
            outputTokens: result.tokenUsage.output,
            purpose: "execute_instruction",
          },
        });
      }

      return result;
    }),

  // =========================================================================
  // Brand settings (hard params for email generation)
  // =========================================================================

  /** Get brand settings for email generation */
  getBrandSettings: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const profile = await ctx.prisma.brandProfile.findFirst({
        where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
        select: {
          id: true,
          logoPosition: true,
          headerBgColor: true,
          footerText: true,
          showSocialLinks: true,
          showAddress: true,
          creativeIntensity: true,
        },
      });
      if (!profile) return null;
      return profile;
    }),

  /** Update brand settings (logo position, header bg, footer, toggles) */
  updateBrandSettings: workspaceProcedure
    .input(z.object({
      storeId: z.string(),
      logoPosition: z.enum(["left", "center", "right"]).optional(),
      headerBgColor: z.string().optional().nullable(),
      footerText: z.string().optional().nullable(),
      showSocialLinks: z.boolean().optional(),
      showAddress: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { storeId, ...data } = input;
      const profile = await ctx.prisma.brandProfile.findFirst({
        where: { storeId, workspaceId: ctx.workspaceId },
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Brand profile not found. Run brand analysis first." });

      return ctx.prisma.brandProfile.update({
        where: { id: profile.id },
        data,
      });
    }),

  // =========================================================================
  // Brand assets
  // =========================================================================

  /** List brand assets for a store */
  listBrandAssets: workspaceProcedure
    .input(z.object({
      storeId: z.string(),
      type: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.brandAsset.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          storeId: input.storeId,
          ...(input.type ? { type: input.type } : {}),
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  /** Add a brand asset (URL-based for MVP) */
  addBrandAsset: workspaceProcedure
    .input(z.object({
      storeId: z.string(),
      type: z.enum(["logo", "logo_dark", "hero", "lifestyle", "icon", "other"]),
      url: z.string().url(),
      fileName: z.string(),
      mimeType: z.string().optional(),
      width: z.number().int().optional(),
      height: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.brandAsset.create({
        data: {
          workspaceId: ctx.workspaceId,
          storeId: input.storeId,
          type: input.type,
          url: input.url,
          fileName: input.fileName,
          mimeType: input.mimeType,
          width: input.width,
          height: input.height,
        },
      });
    }),

  /** Delete a brand asset */
  deleteBrandAsset: workspaceProcedure
    .input(z.object({ assetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.brandAsset.deleteMany({
        where: { id: input.assetId, workspaceId: ctx.workspaceId },
      });
      return { success: true };
    }),

  // =========================================================================
  // Chat history
  // =========================================================================

  /** List recent chats */
  listChats: workspaceProcedure
    .input(z.object({
      storeId: z.string(),
      limit: z.number().min(1).max(50).default(20),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const chats = await ctx.prisma.aiChat.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          storeId: input.storeId,
          ...(input.cursor ? { updatedAt: { lt: new Date(input.cursor) } } : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: input.limit + 1,
        include: {
          _count: { select: { messages: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, role: true },
          },
        },
      });

      let nextCursor: string | undefined;
      if (chats.length > input.limit) {
        const last = chats.pop()!;
        nextCursor = last.updatedAt.toISOString();
      }

      return {
        chats: chats.map((c) => ({
          id: c.id,
          title: c.title,
          updatedAt: c.updatedAt,
          messageCount: c._count.messages,
          lastMessage: c.messages[0]?.content?.slice(0, 80) ?? "",
        })),
        nextCursor,
      };
    }),

  /** Get a single chat with all messages */
  getChat: workspaceProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ ctx, input }) => {
      const chat = await ctx.prisma.aiChat.findFirst({
        where: { id: input.chatId, workspaceId: ctx.workspaceId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              role: true,
              content: true,
              highlights: true,
              model: true,
              createdAt: true,
            },
          },
        },
      });
      if (!chat) throw new TRPCError({ code: "NOT_FOUND", message: "Chat not found" });
      return chat;
    }),

  /** Rename a chat */
  renameChat: workspaceProcedure
    .input(z.object({ chatId: z.string(), title: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.aiChat.updateMany({
        where: { id: input.chatId, workspaceId: ctx.workspaceId },
        data: { title: input.title },
      });
      return { success: true };
    }),

  /** Delete a chat and its messages */
  deleteChat: workspaceProcedure
    .input(z.object({ chatId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.aiChat.deleteMany({
        where: { id: input.chatId, workspaceId: ctx.workspaceId },
      });
      return { success: true };
    }),

  /** Check brand analysis job status */
  brandAnalysisStatus: workspaceProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = await brandAnalysisQueue.getJob(input.jobId);
      if (!job) return { status: "not_found" as const };

      const state = await job.getState();
      const failedReason = job.failedReason;

      return {
        status: state as "waiting" | "active" | "completed" | "failed" | "delayed",
        failedReason: failedReason ?? undefined,
      };
    }),

  // =========================================================================
  // Agent Activity & Observations
  // =========================================================================

  /** List recent agent actions (for AgentCanvas timeline) */
  listAgentActions: workspaceProcedure
    .input(z.object({
      storeId: z.string(),
      limit: z.number().min(1).max(100).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const actions = await ctx.prisma.agentAction.findMany({
        where: { storeId: input.storeId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        select: {
          id: true,
          agentType: true,
          actionType: true,
          input: true,
          output: true,
          status: true,
          createdAt: true,
        },
      });
      return actions;
    }),

  /** List agent observations (proactive alerts) */
  listObservations: workspaceProcedure
    .input(z.object({
      storeId: z.string(),
      unacknowledgedOnly: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const observations = await ctx.prisma.agentObservation.findMany({
        where: {
          storeId: input.storeId,
          ...(input.unacknowledgedOnly ? { acknowledged: false } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          type: true,
          severity: true,
          summary: true,
          data: true,
          acknowledged: true,
          createdAt: true,
        },
      });
      return observations;
    }),

  /** Acknowledge an observation */
  acknowledgeObservation: workspaceProcedure
    .input(z.object({ observationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.agentObservation.update({
        where: { id: input.observationId },
        data: { acknowledged: true },
      });
      return { success: true };
    }),

  /** List active customer conversations (for ConversationManager) */
  listConversations: workspaceProcedure
    .input(z.object({
      storeId: z.string(),
      status: z.enum(["active", "waiting", "resolved", "escalated"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conversations = await ctx.prisma.conversation.findMany({
        where: {
          storeId: input.storeId,
          ...(input.status ? { status: input.status as any } : { status: { not: "resolved" as any } }),
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, role: true, createdAt: true },
          },
          _count: { select: { messages: true } },
        },
      });

      return conversations.map((c) => ({
        id: c.id,
        channel: c.channel,
        status: c.status,
        assignedTo: c.assignedTo,
        customer: c.customer,
        lastMessage: c.messages[0],
        messageCount: c._count.messages,
        updatedAt: c.updatedAt,
      }));
    }),

  /** Get full conversation with all messages */
  getConversation: workspaceProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const conversation = await ctx.prisma.conversation.findFirst({
        where: { id: input.conversationId },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          messages: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              role: true,
              content: true,
              contentType: true,
              metadata: true,
              createdAt: true,
            },
          },
        },
      });
      if (!conversation) throw new TRPCError({ code: "NOT_FOUND" });
      return conversation;
    }),

  /** Claim a conversation for human handling */
  claimConversation: workspaceProcedure
    .input(z.object({
      conversationId: z.string(),
      agentName: z.string().default("Merchant"),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.conversation.update({
        where: { id: input.conversationId },
        data: { assignedTo: input.agentName, status: "active" },
      });
      return { success: true };
    }),

  /** Release a conversation back to the AI agent */
  releaseConversation: workspaceProcedure
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.conversation.update({
        where: { id: input.conversationId },
        data: { assignedTo: null, status: "waiting" },
      });
      return { success: true };
    }),

  /** Send a reply to a customer conversation (merchant → customer) */
  sendConversationReply: workspaceProcedure
    .input(z.object({
      conversationId: z.string(),
      message: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const conversation = await ctx.prisma.conversation.findFirst({
        where: { id: input.conversationId },
        include: {
          customer: { select: { phone: true } },
        },
      });
      if (!conversation) throw new TRPCError({ code: "NOT_FOUND" });

      // Save message
      await ctx.prisma.conversationMessage.create({
        data: {
          conversationId: input.conversationId,
          role: "assistant",
          content: input.message,
          metadata: { sentBy: "merchant" } as any,
        },
      });

      // Send via the appropriate channel
      if (conversation.customer?.phone && (conversation.channel === "sms" || conversation.channel === "whatsapp")) {
        const { sendSms, sendWhatsApp } = await import("@allohq/messaging");
        const phone = conversation.customer.phone;

        if (conversation.channel === "whatsapp") {
          await sendWhatsApp({ channel: "whatsapp", to: phone, body: input.message });
        } else {
          await sendSms({ channel: "sms", to: phone, body: input.message });
        }
      }

      return { success: true };
    }),
});
