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
      // Fetch store for URL
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      const storeUrl = `https://${store.shopDomain}`;

      // Fetch brand profile
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

  /** Regenerate with different parameters */
  regenerate: workspaceProcedure
    .input(
      z.object({
        templateId: z.string(),
        intent: emailIntentSchema.optional(),
        model: aiModelSchema,
        tweaks: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.generatedContent.findFirst({
        where: { templateId: input.templateId, workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "No generated content found for this template" });

      // Re-generate using the original prompt context + tweaks
      const { generateEmail } = await import("@allohq/customer-intelligence");

      const result = await generateEmail({
        intent: input.intent ?? (existing.intent as any),
        model: input.model,
        products: [],
        tweaks: input.tweaks,
      });

      // Update template
      await ctx.prisma.emailTemplate.update({
        where: { id: input.templateId },
        data: {
          name: result.subject,
          subject: result.subject,
          previewText: result.previewText,
          blocks: result.blocks as any,
        },
      });

      // Save new audit trail
      await ctx.prisma.generatedContent.create({
        data: {
          workspaceId: ctx.workspaceId,
          templateId: input.templateId,
          prompt: result.promptUsed,
          response: JSON.stringify(result),
          model: result.model,
          intent: input.intent ?? existing.intent,
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

      return { success: true, reasoning: result.reasoning, model: result.model };
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
`.trim();

      // ---------------------------------------------------------------
      // 3. Build conversation prompt
      // ---------------------------------------------------------------
      const systemPrompt = `You are Allo AI, the intelligent assistant for AlloHQ — an e-commerce customer retention and marketing automation platform.

You have FULL access to the store's data. Use it to give specific, data-driven answers. Never say you don't have access to data — you do. All store data is provided below.

CAPABILITIES:
- Answer questions about specific customers (lookup by name, email, spending behavior)
- Analyze customer segments, revenue trends, and purchasing patterns
- Provide actionable retention insights and recommendations
- Create automations, campaigns, templates, and segments when asked
- Explain RFM scoring, churn predictions, and lifetime value

RULES:
1. Be specific — use actual numbers, names, and data from the store context
2. When asked about a customer, find them in the data and give detailed info
3. When asked to create something (automation, campaign, template, segment), set action.type accordingly
4. For analytical questions, do real analysis of the data provided
5. Keep responses concise but informative — no fluff
6. Format currency as $X,XXX.XX
7. If you truly cannot find something in the data, say so honestly

FORMATTING RULES FOR "reply":
- Use **markdown** formatting — bold, headers, tables, bullet lists
- For data comparisons and lists of customers/orders/segments, ALWAYS use markdown tables:
  | Customer | Spent | Orders | Segment |
  |----------|-------|--------|---------|
  | Name     | $X    | N      | Champs  |
- Use **bold** for key numbers and metrics inline
- Use ## headers to organize sections when the answer covers multiple topics
- Use bullet points for insights and recommendations
- Keep paragraphs short (2-3 sentences max)
- DO NOT use code blocks — just plain markdown

RESPONSE FORMAT:
You MUST respond with valid JSON in this exact format:
{
  "reply": "Your markdown-formatted response",
  "highlights": [
    { "label": "Short Label", "value": "$1,234" }
  ],
  "action": null
}

"highlights" is an array of 2-5 key metrics/stats that summarize the answer at a glance. Always include highlights when the answer involves numbers or data. Each highlight has a short label (1-3 words) and a value. Examples:
- { "label": "Revenue", "value": "$207,048" }
- { "label": "Customers", "value": "96" }
- { "label": "Churn Risk", "value": "12%" }
- { "label": "AOV", "value": "$1,804" }

For simple conversational answers or acknowledgments, highlights can be an empty array [].

If the user explicitly asks to CREATE something (automation, campaign, template, segment), also include:
{
  "reply": "Your response...",
  "highlights": [...],
  "action": {
    "type": "create_automation" | "create_campaign" | "create_template" | "create_segment",
    "instruction": "A clear instruction for the creation system, e.g. 'Create a win-back automation for at-risk customers with a 15% discount'"
  }
}

Only set action when the user explicitly wants to CREATE or BUILD something. For questions, analysis, and lookups, action should be null.

--- STORE DATA ---
${storeContext}`;

      // Build conversation history
      const historyBlock = input.history.length > 0
        ? input.history.map((m) => `${m.role === "user" ? "User" : "Allo AI"}: ${m.content}`).join("\n\n")
        : "";

      const userPrompt = [
        historyBlock ? `Previous conversation:\n${historyBlock}\n\n` : "",
        `User: ${input.message}`,
        "\nRespond with JSON:",
      ].join("");

      // ---------------------------------------------------------------
      // 4. Call LLM
      // ---------------------------------------------------------------
      const { complete } = await import("@allohq/customer-intelligence");

      const workspace = await ctx.prisma.workspace.findUnique({
        where: { id: ctx.workspaceId },
        select: { defaultModel: true },
      });

      const aiResult = await complete({
        prompt: userPrompt,
        system: systemPrompt,
        model: (workspace?.defaultModel as any) ?? undefined,
        temperature: 0.4,
        maxTokens: 2048,
        jsonMode: true,
      });

      // ---------------------------------------------------------------
      // 5. Parse response
      // ---------------------------------------------------------------
      let reply = "";
      let highlights: { label: string; value: string }[] = [];
      let action: { type: string; instruction: string } | null = null;

      try {
        const parsed = JSON.parse(aiResult.content);
        reply = parsed.reply ?? aiResult.content;
        highlights = Array.isArray(parsed.highlights) ? parsed.highlights : [];
        action = parsed.action ?? null;
      } catch {
        // If JSON parsing fails, use raw content as reply
        reply = aiResult.content;
      }

      // ---------------------------------------------------------------
      // 6. Execute action if detected
      // ---------------------------------------------------------------
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

      if (action?.type && action?.instruction) {
        try {
          const { parseInstruction, executeInstruction } = await import("@allohq/customer-intelligence");

          const parsedInstruction = await parseInstruction(action.instruction, {
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

          // Record action token usage
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
          // Don't fail the whole chat — just note the error in reply
          reply += "\n\n(Note: I tried to execute the action but encountered an error. Please try again or use the specific feature page.)";
        }
      }

      // Record chat token usage
      await ctx.prisma.tokenUsage.create({
        data: {
          workspaceId: ctx.workspaceId,
          model: aiResult.model,
          inputTokens: aiResult.inputTokens,
          outputTokens: aiResult.outputTokens,
          purpose: "chat",
        },
      });

      return {
        reply,
        highlights,
        action: actionResult,
        model: aiResult.model,
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
});
