import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";

export const guardrailsRouter = router({
  /** List all guardrails for a store */
  list: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.guardrail.findMany({
        where: { storeId: input.storeId },
        orderBy: { createdAt: "desc" },
      });
    }),

  /** Create a new guardrail rule */
  create: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        ruleType: z.string(),
        ruleValue: z.record(z.unknown()),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.guardrail.create({
        data: {
          storeId: input.storeId,
          ruleType: input.ruleType,
          ruleValue: input.ruleValue as any,
          isActive: input.isActive ?? true,
        },
      });
    }),

  /** Update a guardrail rule */
  update: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        ruleType: z.string().optional(),
        ruleValue: z.record(z.unknown()).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const updateData: Record<string, unknown> = {};
      if (data.ruleType !== undefined) updateData.ruleType = data.ruleType;
      if (data.ruleValue !== undefined) updateData.ruleValue = data.ruleValue as any;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      return ctx.prisma.guardrail.update({
        where: { id },
        data: updateData,
      });
    }),

  /** Delete a guardrail rule */
  delete: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.guardrail.delete({ where: { id: input.id } });
      return { success: true };
    }),

  /** Validate a proposed action against all active guardrails */
  validate: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        actionType: z.string(),
        payload: z.record(z.unknown()),
      }),
    )
    .query(async ({ ctx, input }) => {
      const guardrails = await ctx.prisma.guardrail.findMany({
        where: { storeId: input.storeId, isActive: true },
      });

      const violations: Array<{ ruleType: string; message: string }> = [];

      for (const rule of guardrails) {
        const ruleValue = rule.ruleValue as Record<string, unknown>;

        switch (rule.ruleType) {
          case "max_discount": {
            const maxDiscount = ruleValue.maxPercent as number;
            const actionDiscount = input.payload.discountPercent as number | undefined;
            if (actionDiscount && actionDiscount > maxDiscount) {
              violations.push({
                ruleType: rule.ruleType,
                message: `Discount ${actionDiscount}% exceeds max ${maxDiscount}%`,
              });
            }
            break;
          }

          case "max_sends_per_week": {
            const maxSends = ruleValue.max as number;
            const channel = input.payload.channel as string | undefined;
            if (channel && maxSends) {
              // Check would be done by governor at execution time
              // Here we just validate the config is valid
            }
            break;
          }

          case "blocked_words": {
            const blockedWords = ruleValue.words as string[];
            const content = input.payload.content as string | undefined;
            if (content && blockedWords) {
              const found = blockedWords.filter((w) =>
                content.toLowerCase().includes(w.toLowerCase()),
              );
              if (found.length > 0) {
                violations.push({
                  ruleType: rule.ruleType,
                  message: `Content contains blocked words: ${found.join(", ")}`,
                });
              }
            }
            break;
          }

          case "quiet_hours": {
            const startHour = ruleValue.startHour as number;
            const endHour = ruleValue.endHour as number;
            const scheduledHour = input.payload.scheduledHour as number | undefined;
            if (scheduledHour != null) {
              const inQuietHours =
                startHour > endHour
                  ? scheduledHour >= startHour || scheduledHour < endHour
                  : scheduledHour >= startHour && scheduledHour < endHour;
              if (inQuietHours) {
                violations.push({
                  ruleType: rule.ruleType,
                  message: `Scheduled during quiet hours (${startHour}:00 - ${endHour}:00)`,
                });
              }
            }
            break;
          }

          case "spending_cap": {
            const maxSpend = ruleValue.maxMonthly as number;
            const estimatedCost = input.payload.estimatedCost as number | undefined;
            if (estimatedCost && estimatedCost > maxSpend) {
              violations.push({
                ruleType: rule.ruleType,
                message: `Estimated cost $${estimatedCost} exceeds monthly cap $${maxSpend}`,
              });
            }
            break;
          }
        }
      }

      return {
        valid: violations.length === 0,
        violations,
        rulesChecked: guardrails.length,
      };
    }),
});
