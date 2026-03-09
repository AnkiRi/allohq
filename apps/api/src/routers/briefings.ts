import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getMissionControlData, getBaseline, generateStoreReport } from "@allohq/merchant-copilot";

export const briefingsRouter = router({
  /** Get the latest briefing for a store */
  latest: protectedProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.merchantBriefing.findFirst({
        where: { storeId: input.storeId },
        orderBy: { createdAt: "desc" },
      });
    }),

  /** List briefings with pagination */
  list: protectedProcedure
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
  markRead: protectedProcedure
    .input(z.object({ briefingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.merchantBriefing.update({
        where: { id: input.briefingId },
        data: { readAt: new Date() },
      });
    }),

  /** Get Mission Control data */
  missionControl: protectedProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ input }) => {
      return getMissionControlData(input.storeId);
    }),

  /** Get store baseline metrics */
  baseline: protectedProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ input }) => {
      return getBaseline(input.storeId);
    }),

  /** Generate store intelligence report */
  storeReport: protectedProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ input }) => {
      return generateStoreReport(input.storeId);
    }),

  /** Get notification preferences for briefings */
  preferences: protectedProcedure
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
  updatePreferences: protectedProcedure
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
});
