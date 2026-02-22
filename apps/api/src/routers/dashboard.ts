import { router, workspaceProcedure } from "../trpc";

export const dashboardRouter = router({
  /** Dashboard stats overview */
  stats: workspaceProcedure.query(async ({ ctx }) => {
    const stores = await ctx.prisma.store.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    const storeIds = stores.map((s) => s.id);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalCustomers, totalRevenue, revenueThisMonth, recentOrders] =
      await Promise.all([
        ctx.prisma.customer.count({
          where: { storeId: { in: storeIds } },
        }),
        ctx.prisma.order.aggregate({
          where: { storeId: { in: storeIds } },
          _sum: { totalPrice: true },
        }),
        ctx.prisma.order.aggregate({
          where: {
            storeId: { in: storeIds },
            createdAt: { gte: startOfMonth },
          },
          _sum: { totalPrice: true },
        }),
        ctx.prisma.order.findMany({
          where: { storeId: { in: storeIds } },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            customer: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        }),
      ]);

    return {
      totalCustomers,
      totalRevenue: totalRevenue._sum.totalPrice ?? 0,
      revenueThisMonth: revenueThisMonth._sum.totalPrice ?? 0,
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        totalPrice: o.totalPrice,
        status: o.status,
        createdAt: o.createdAt,
        customerName: o.customer
          ? `${o.customer.firstName ?? ""} ${o.customer.lastName ?? ""}`.trim() || o.customer.email
          : "Unknown",
      })),
    };
  }),
});
