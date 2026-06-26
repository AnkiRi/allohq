import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { verifyStoreScopedAccess } from "../lib/storeAccess";

export const customersRouter = router({
  /** List customers with pagination, search, and segment filter */
  list: workspaceProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        segment: z.string().optional(),
        sortBy: z.enum(["createdAt", "totalSpent", "orderCount"]).default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      })
    )
    .query(async ({ ctx, input }) => {
      const stores = await ctx.prisma.store.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      const storeIds = stores.map((s) => s.id);

      const where: any = { storeId: { in: storeIds } };

      if (input.search) {
        where.OR = [
          { email: { contains: input.search, mode: "insensitive" } },
          { firstName: { contains: input.search, mode: "insensitive" } },
          { lastName: { contains: input.search, mode: "insensitive" } },
        ];
      }

      if (input.segment) {
        where.rfmScore = { segment: input.segment };
      }

      const orderBy: any =
        input.sortBy === "totalSpent"
          ? { rfmScore: { totalSpent: input.sortOrder } }
          : input.sortBy === "orderCount"
          ? { rfmScore: { orderCount: input.sortOrder } }
          : { createdAt: input.sortOrder };

      const [customers, total] = await Promise.all([
        ctx.prisma.customer.findMany({
          where,
          include: {
            rfmScore: true,
            lifetimeValue: true,
            _count: { select: { orders: true } },
          },
          orderBy,
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
        ctx.prisma.customer.count({ where }),
      ]);

      return {
        customers,
        total,
        pages: Math.ceil(total / input.limit),
        page: input.page,
      };
    }),

  /** Get single customer with full details */
  getById: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "customer", input.id);
      const customer = await ctx.prisma.customer.findUnique({
        where: { id: input.id },
        include: {
          rfmScore: true,
          lifetimeValue: true,
          orders: {
            orderBy: { createdAt: "desc" },
            take: 10,
            include: { items: true },
          },
          store: { select: { id: true, shopDomain: true, platform: true } },
        },
      });

      return customer;
    }),

  /** Get customer overview stats */
  stats: workspaceProcedure.query(async ({ ctx }) => {
    const stores = await ctx.prisma.store.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    const storeIds = stores.map((s) => s.id);

    const [totalCustomers, acceptsMarketing, totalRevenue, avgOrderValue] =
      await Promise.all([
        ctx.prisma.customer.count({
          where: { storeId: { in: storeIds } },
        }),
        ctx.prisma.customer.count({
          where: { storeId: { in: storeIds }, acceptsMarketing: true },
        }),
        ctx.prisma.rfmScore.aggregate({
          where: { storeId: { in: storeIds } },
          _sum: { totalSpent: true },
        }),
        ctx.prisma.rfmScore.aggregate({
          where: { storeId: { in: storeIds } },
          _avg: { avgOrderValue: true },
        }),
      ]);

    return {
      totalCustomers,
      acceptsMarketing,
      marketingRate: totalCustomers > 0 ? (acceptsMarketing / totalCustomers) * 100 : 0,
      totalRevenue: totalRevenue._sum.totalSpent ?? 0,
      avgOrderValue: avgOrderValue._avg.avgOrderValue ?? 0,
    };
  }),
});
