import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { DEFAULT_SEGMENTS } from "@allohq/customer-intelligence";

export const segmentsRouter = router({
  /** List all segments for the workspace */
  list: workspaceProcedure.query(async ({ ctx }) => {
    const stores = await ctx.prisma.store.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    const storeIds = stores.map((s) => s.id);

    const segments = await ctx.prisma.customerSegment.findMany({
      where: { storeId: { in: storeIds } },
      orderBy: { rfmMax: "desc" },
    });

    return segments;
  }),

  /** Initialize default segments for a store */
  initDefaults: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const segments = await ctx.prisma.customerSegment.createMany({
        data: DEFAULT_SEGMENTS.map((s) => ({
          ...s,
          storeId: input.storeId,
          isSystem: true,
        })),
        skipDuplicates: true,
      });

      return { created: segments.count };
    }),

  /** Get segment distribution (how many customers per segment) */
  distribution: workspaceProcedure.query(async ({ ctx }) => {
    const stores = await ctx.prisma.store.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    const storeIds = stores.map((s) => s.id);

    const distribution = await ctx.prisma.rfmScore.groupBy({
      by: ["segment"],
      where: { storeId: { in: storeIds } },
      _count: { id: true },
      _sum: { totalSpent: true },
      _avg: { avgOrderValue: true },
    });

    return distribution.map((d) => ({
      segment: d.segment,
      customerCount: d._count.id,
      totalRevenue: d._sum.totalSpent ?? 0,
      avgOrderValue: d._avg.avgOrderValue ?? 0,
    }));
  }),
});
