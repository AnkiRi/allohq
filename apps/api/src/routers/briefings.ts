import { z } from "zod";
import { router, workspaceProcedure, storeProcedure } from "../trpc";
import { verifyStoreScopedAccess } from "../lib/storeAccess";
import { getMissionControlData, getBaseline, generateStoreReport } from "@allohq/merchant-copilot";

export const briefingsRouter = router({
  /** Get the latest briefing for a store, enriched with customer voice themes */
  latest: storeProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [briefing, voiceReport] = await Promise.all([
        ctx.prisma.merchantBriefing.findFirst({
          where: { storeId: input.storeId },
          orderBy: { createdAt: "desc" },
        }),
        ctx.prisma.customerVoiceReport.findFirst({
          where: { storeId: input.storeId },
          orderBy: { weekOf: "desc" },
        }),
      ]);

      if (!briefing) return null;

      // Enrich briefing with customer voice snippet if a report exists for the current week
      let customerVoiceSnippet: string | null = null;
      if (voiceReport) {
        const themes = voiceReport.themes as Array<{ theme: string; count: number; sentiment: number }>;
        const insights = voiceReport.actionableInsights as Array<{ insight: string; priority: string; relatedTheme: string }>;
        const topTheme = themes.length > 0 ? themes.sort((a, b) => b.count - a.count)[0] : null;
        const topInsight = insights.length > 0 ? insights.find((i) => i.priority === "high") ?? insights[0] : null;

        if (topTheme) {
          customerVoiceSnippet = `This week, ${voiceReport.totalConversations} customers mentioned "${topTheme.theme}".${topInsight ? ` ${topInsight.insight}.` : ""}`;
        }
      }

      return {
        ...briefing,
        customerVoiceSnippet,
        customerVoiceReport: voiceReport ? {
          weekOf: voiceReport.weekOf,
          totalConversations: voiceReport.totalConversations,
          avgSentiment: voiceReport.avgSentiment,
          themes: voiceReport.themes,
          summary: voiceReport.summary,
        } : null,
      };
    }),

  /** List briefings with pagination */
  list: storeProcedure
    .input(z.object({
      storeId: z.string(),
      type: z.enum(["daily", "weekly", "alert"]).optional(),
      limit: z.number().min(1).max(50).default(10),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.prisma.merchantBriefing.findMany({
        where: {
          storeId: input.storeId,
          ...(input.type ? { type: input.type } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }

      return { items, nextCursor };
    }),

  /** Mark a briefing as read */
  markRead: workspaceProcedure
    .input(z.object({ briefingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "merchantBriefing", input.briefingId);
      return ctx.prisma.merchantBriefing.update({
        where: { id: input.briefingId },
        data: { readAt: new Date() },
      });
    }),

  /** Get Mission Control data */
  missionControl: storeProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ input }) => {
      return getMissionControlData(input.storeId);
    }),

  /** Get store baseline metrics */
  baseline: storeProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ input }) => {
      return getBaseline(input.storeId);
    }),

  /** Generate store intelligence report */
  storeReport: storeProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ input }) => {
      return generateStoreReport(input.storeId);
    }),

  /** Get notification preferences for briefings */
  preferences: storeProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findUnique({
        where: { id: input.storeId },
        select: { messagingConfig: true },
      });
      const config = (store?.messagingConfig as Record<string, unknown>) ?? {};
      const prefs = (config["briefingPreferences"] as Record<string, unknown>) ?? {};
      return {
        channel: (prefs["channel"] as string) ?? "email",
        dailyEnabled: (prefs["dailyEnabled"] as boolean) ?? true,
        weeklyEnabled: (prefs["weeklyEnabled"] as boolean) ?? true,
        alertsEnabled: (prefs["alertsEnabled"] as boolean) ?? true,
        quietHoursStart: (prefs["quietHoursStart"] as string) ?? "22:00",
        quietHoursEnd: (prefs["quietHoursEnd"] as string) ?? "07:00",
      };
    }),

  /** Update notification preferences for briefings */
  updatePreferences: storeProcedure
    .input(z.object({
      storeId: z.string(),
      channel: z.enum(["email", "whatsapp", "in_app"]).optional(),
      dailyEnabled: z.boolean().optional(),
      weeklyEnabled: z.boolean().optional(),
      alertsEnabled: z.boolean().optional(),
      quietHoursStart: z.string().optional(),
      quietHoursEnd: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { storeId, ...prefs } = input;
      const store = await ctx.prisma.store.findUnique({
        where: { id: storeId },
        select: { messagingConfig: true },
      });
      const config = (store?.messagingConfig as Record<string, unknown>) ?? {};
      const existing = (config["briefingPreferences"] as Record<string, unknown>) ?? {};

      const updated = { ...existing };
      for (const [k, v] of Object.entries(prefs)) {
        if (v !== undefined) updated[k] = v;
      }

      await ctx.prisma.store.update({
        where: { id: storeId },
        data: {
          messagingConfig: {
            ...config,
            briefingPreferences: updated,
          } as any,
        },
      });

      return updated;
    }),

  /** Get contextual page greeting and suggestions for the AI panel */
  pageContext: storeProcedure
    .input(z.object({ storeId: z.string(), page: z.string() }))
    .query(async ({ ctx, input }) => {
      const { storeId, page } = input;

      // Gather counts in parallel
      // Get workspaceId from store
      const store = await ctx.prisma.store.findUnique({ where: { id: storeId }, select: { workspaceId: true } });
      const workspaceId = store?.workspaceId ?? "";

      const [customerCount, segmentGroups, campaignCount, automationCount, templateCount, formCount, conversationCount] = await Promise.all([
        ctx.prisma.customer.count({ where: { storeId } }),
        ctx.prisma.rfmScore.groupBy({ by: ["segment"], where: { storeId }, _count: { id: true } }),
        ctx.prisma.campaign.count({ where: { storeId } }),
        ctx.prisma.automation.count({ where: { storeId } }),
        ctx.prisma.emailTemplate.count({ where: { workspaceId } }),
        ctx.prisma.form.count({ where: { storeId } }),
        ctx.prisma.conversation.count({ where: { storeId } }),
      ]);

      const atRisk = segmentGroups.find((s: { segment: string; _count: { id: number } }) => s.segment === "At Risk")?._count.id ?? 0;
      const champions = segmentGroups.find((s: { segment: string; _count: { id: number } }) => s.segment === "Champions")?._count.id ?? 0;
      const activeAutomations = await ctx.prisma.automation.count({ where: { storeId, status: "active" } });
      const draftCampaigns = await ctx.prisma.campaign.count({ where: { storeId, status: "draft" } });

      type Suggestion = { label: string; message: string };

      let greeting = "";
      const suggestions: Suggestion[] = [];

      switch (page) {
        case "customers":
          greeting = `You have ${customerCount} customers.${champions > 0 ? ` ${champions} are Champions.` : ""}${atRisk > 0 ? ` ${atRisk} are at risk \u2014 want me to draft a win-back?` : ""}`;
          if (atRisk > 0) suggestions.push({ label: "Show at-risk customers", message: "Show me customers who are at risk of churning" });
          suggestions.push({ label: "Draft win-back campaign", message: "Create a win-back automation for at-risk customers" });
          break;
        case "campaigns":
          greeting = `You have ${campaignCount} campaign${campaignCount !== 1 ? "s" : ""}.${draftCampaigns > 0 ? ` ${draftCampaigns} draft${draftCampaigns > 1 ? "s" : ""} awaiting review.` : ""} Want me to create a new one?`;
          suggestions.push({ label: "Review drafts", message: "Show me my draft campaigns" });
          suggestions.push({ label: "Create campaign", message: "Create a new email campaign" });
          suggestions.push({ label: "Show best performers", message: "Show me my best performing campaigns" });
          break;
        case "automations":
          greeting = `${automationCount} automations configured. ${activeAutomations} live, ${automationCount - activeAutomations} paused or in draft.`;
          suggestions.push({ label: "Activate recommended", message: "Activate all recommended automations" });
          suggestions.push({ label: "Show performance", message: "Show me automation performance stats" });
          break;
        case "analytics":
          greeting = `Your analytics dashboard. Ask me to compare time periods, break down by channel, or export data.`;
          suggestions.push({ label: "Compare to last month", message: "Compare this month's performance to last month" });
          suggestions.push({ label: "Show channel breakdown", message: "Show me revenue breakdown by channel" });
          suggestions.push({ label: "Export report", message: "Generate a weekly performance report" });
          break;
        case "segments":
          greeting = `${segmentGroups.length} active segments.${champions > 0 ? ` Champions: ${champions} customers.` : ""}${atRisk > 0 ? ` At Risk: ${atRisk} customers.` : ""}`;
          suggestions.push({ label: "Show segment movements", message: "Show me how segments have shifted recently" });
          suggestions.push({ label: "Draft campaign for segment", message: "Create a campaign targeting a specific segment" });
          break;
        case "forms":
          greeting = `${formCount} form${formCount !== 1 ? "s" : ""} created.${formCount === 0 ? " Set up a popup to capture marketing opt-ins." : ""}`;
          suggestions.push({ label: "Create popup", message: "Create a new email capture popup" });
          suggestions.push({ label: "Show best practices", message: "What are the best practices for email capture forms?" });
          break;
        case "conversations":
          greeting = `${conversationCount} conversation${conversationCount !== 1 ? "s" : ""} tracked.`;
          suggestions.push({ label: "Show escalated", message: "Show me escalated conversations that need attention" });
          suggestions.push({ label: "Review resolved", message: "Show me recently resolved conversations" });
          break;
        case "templates":
          greeting = `${templateCount} template${templateCount !== 1 ? "s" : ""} available.`;
          suggestions.push({ label: "Generate new template", message: "Generate a new email template matching my brand" });
          suggestions.push({ label: "Duplicate best performer", message: "Duplicate my best performing template" });
          break;
        default:
          greeting = `How can I help you?`;
          suggestions.push({ label: "Show overview", message: "Give me an overview of my store" });
          break;
      }

      return { greeting, suggestions };
    }),

  /** Get smart suggested actions based on current store state */
  suggestedActions: storeProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { storeId } = input;

      const [pendingActions, automations, segmentGroups, customerCount] = await Promise.all([
        ctx.prisma.actionQueue.count({ where: { storeId, status: "pending" } }),
        ctx.prisma.automation.findMany({
          where: { storeId },
          select: { status: true },
        }),
        ctx.prisma.rfmScore.groupBy({
          by: ["segment"],
          where: { storeId },
          _count: { id: true },
        }),
        ctx.prisma.customer.count({ where: { storeId } }),
      ]);

      const suggestions: Array<{
        label: string;
        message: string;
        priority: number;
      }> = [];

      // Pending actions
      if (pendingActions > 0) {
        suggestions.push({
          label: `Review ${pendingActions} pending action${pendingActions > 1 ? "s" : ""}`,
          message: `Show me the ${pendingActions} pending actions and help me decide which to approve`,
          priority: 1,
        });
      }

      // Hibernating customers
      const hibernating = segmentGroups.find((s: { segment: string; _count: { id: number } }) =>
        s.segment.toLowerCase().includes("hibernat") || s.segment === "Lost"
      );
      if (hibernating && hibernating._count.id > 0) {
        suggestions.push({
          label: `Win back ${hibernating._count.id} dormant customers`,
          message: `Create a win-back campaign for my ${hibernating._count.id} ${hibernating.segment.toLowerCase()} customers`,
          priority: 2,
        });
      }

      // Ready automations
      const readyCount = automations.filter((a) => a.status === "ready").length;
      if (readyCount > 0) {
        suggestions.push({
          label: `Activate ${readyCount} automation${readyCount > 1 ? "s" : ""}`,
          message: `Activate the ${readyCount} automations that are ready to go live`,
          priority: 3,
        });
      }

      // Marketing opt-in
      const acceptsMarketing = await ctx.prisma.customer.count({
        where: { storeId, acceptsMarketing: true },
      });
      const optInRate = customerCount > 0 ? Math.round((acceptsMarketing / customerCount) * 100) : 0;
      if (optInRate < 5) {
        suggestions.push({
          label: "Set up lead capture",
          message: "Create a popup form to capture email subscribers with an incentive",
          priority: 4,
        });
      }

      // Always include a strategic option
      suggestions.push({
        label: "What should I focus on today?",
        message: "Based on my store data, what's the highest-impact thing I should do today?",
        priority: 10,
      });

      return suggestions.sort((a, b) => a.priority - b.priority).slice(0, 4);
    }),
});
