import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";

export const notificationsRouter = router({
  /** Get notification preferences for the current user */
  getPreferences: workspaceProcedure.query(async ({ ctx }) => {
    const pref = await ctx.prisma.notificationPreference.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
        },
      },
    });
    return pref;
  }),

  /** Upsert notification preferences */
  upsertPreferences: workspaceProcedure
    .input(
      z.object({
        // Channel toggles
        emailDigest: z.boolean().optional(),
        emailRealtime: z.boolean().optional(),
        inApp: z.boolean().optional(),
        // Event types
        onActionRequired: z.boolean().optional(),
        onCampaignSent: z.boolean().optional(),
        onEscalation: z.boolean().optional(),
        onChurnAlert: z.boolean().optional(),
        onRevenueGoal: z.boolean().optional(),
        onWeeklyReport: z.boolean().optional(),
        // Quiet hours
        quietHoursStart: z.number().min(0).max(23).nullable().optional(),
        quietHoursEnd: z.number().min(0).max(23).nullable().optional(),
        timezone: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const data = {
        ...(input.emailDigest !== undefined && { emailDigest: input.emailDigest }),
        ...(input.emailRealtime !== undefined && { emailRealtime: input.emailRealtime }),
        ...(input.inApp !== undefined && { inApp: input.inApp }),
        ...(input.onActionRequired !== undefined && { onActionRequired: input.onActionRequired }),
        ...(input.onCampaignSent !== undefined && { onCampaignSent: input.onCampaignSent }),
        ...(input.onEscalation !== undefined && { onEscalation: input.onEscalation }),
        ...(input.onChurnAlert !== undefined && { onChurnAlert: input.onChurnAlert }),
        ...(input.onRevenueGoal !== undefined && { onRevenueGoal: input.onRevenueGoal }),
        ...(input.onWeeklyReport !== undefined && { onWeeklyReport: input.onWeeklyReport }),
        ...(input.quietHoursStart !== undefined && { quietHoursStart: input.quietHoursStart }),
        ...(input.quietHoursEnd !== undefined && { quietHoursEnd: input.quietHoursEnd }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
      };

      return ctx.prisma.notificationPreference.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
          },
        },
        create: {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          ...data,
        },
        update: data,
      });
    }),
});
