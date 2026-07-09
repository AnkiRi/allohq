import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";

/**
 * Activity log — the persisted, human-readable record of what joon's agents
 * actually did (autonomous scheduled runs: overnight ops, churn interventions,
 * A/B conclusions, opportunities, etc.). This powers the operator TERMINAL as a
 * real, scrollable, refresh-surviving history (not the cosmetic per-mount feed).
 *
 * Reads the existing AgentActivityLog substrate the scheduled workers already
 * write to via logActivity() — no new schema. Workspace-scoped (the demo-guest
 * resolves the Vana workspace, so the demo terminal shows real seeded activity).
 */
export const activityRouter = router({
  // Recent agent activity across the workspace's stores, newest first, paged.
  list: workspaceProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(40),
        cursor: z.string().optional(), // AgentActivityLog id to page after
        activityType: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const stores = await ctx.prisma.store.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      const storeIds = stores.map((s) => s.id);
      if (storeIds.length === 0) return { items: [], nextCursor: null as string | null };

      const rows = await ctx.prisma.agentActivityLog.findMany({
        where: {
          storeId: { in: storeIds },
          ...(input.activityType ? { activityType: input.activityType } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          activityType: true,
          summary: true,
          category: true,
          tier: true,
          actionTaken: true,
          entityId: true,
          entityType: true,
          metadata: true,
          revenue: true,
          createdAt: true,
        },
      });

      let nextCursor: string | null = null;
      if (rows.length > input.limit) {
        nextCursor = rows.pop()?.id ?? null;
      }
      return { items: rows, nextCursor };
    }),
});
