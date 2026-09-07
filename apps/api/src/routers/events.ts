import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

/**
 * Events router — handles browse event tracking and activity queries.
 */
export const eventsRouter = router({
  /**
   * Get recent browse activity for analytics.
   * Requires workspace authentication.
   */
  getBrowseActivity: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        limit: z.number().min(1).max(200).default(50),
        cursor: z.string().optional(),
        customerId: z.string().optional(),
        productId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify store belongs to workspace
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
        select: { id: true },
      });

      if (!store) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Store not found in workspace",
        });
      }

      const where: Record<string, unknown> = {
        storeId: input.storeId,
      };
      if (input.customerId) where.customerId = input.customerId;
      if (input.productId) where.productId = input.productId;
      if (input.cursor) {
        where.createdAt = { lt: new Date(input.cursor) };
      }

      const events = await ctx.prisma.browseEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
      });

      let nextCursor: string | undefined;
      if (events.length > input.limit) {
        const last = events.pop()!;
        nextCursor = last.createdAt.toISOString();
      }

      return {
        events,
        nextCursor,
      };
    }),
});
