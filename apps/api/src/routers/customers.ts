import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { verifyStoreScopedAccess } from "../lib/storeAccess";

export const customersRouter = router({
  stateOverview: workspaceProcedure.query(async ({ ctx }) => {
    const stores = await ctx.prisma.store.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    const storeIds = stores.map((store) => store.id);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const now = new Date();
    const [total, lifecycle, cycle, discounts, due, failed, transitions] = await Promise.all([
      ctx.prisma.customerState.count({ where: { storeId: { in: storeIds } } }),
      ctx.prisma.customerState.groupBy({
        by: ["lifecycleStage"],
        where: { storeId: { in: storeIds } },
        _count: { _all: true },
      }),
      ctx.prisma.customerState.groupBy({
        by: ["purchaseCyclePosition"],
        where: { storeId: { in: storeIds } },
        _count: { _all: true },
      }),
      ctx.prisma.customerState.groupBy({
        by: ["discountBehavior"],
        where: { storeId: { in: storeIds } },
        _count: { _all: true },
      }),
      ctx.prisma.customerState.count({
        where: { storeId: { in: storeIds }, nextEvaluationAt: { lte: now } },
      }),
      ctx.prisma.customerState.count({
        where: { storeId: { in: storeIds }, evaluationFailureCount: { gt: 0 } },
      }),
      ctx.prisma.customerStateTransition.groupBy({
        by: ["dimension", "fromValue", "toValue"],
        where: { storeId: { in: storeIds }, occurredAt: { gte: since } },
        _count: { _all: true },
        _max: { occurredAt: true },
        orderBy: { _count: { dimension: "desc" } },
        take: 12,
      }),
    ]);

    return {
      total,
      lifecycle: lifecycle.map((row) => ({ key: row.lifecycleStage, count: row._count._all })),
      cycle: cycle.map((row) => ({ key: row.purchaseCyclePosition, count: row._count._all })),
      discounts: discounts.map((row) => ({ key: row.discountBehavior, count: row._count._all })),
      queue: { due, failed },
      transitions: transitions.map((row) => ({
        dimension: row.dimension,
        fromValue: row.fromValue,
        toValue: row.toValue,
        count: row._count._all,
        lastOccurredAt: row._max.occurredAt,
      })),
      windowStartedAt: since,
    };
  }),

  stateExplorer: workspaceProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(25),
        search: z.string().trim().max(120).optional(),
        lifecycle: z.string().max(40).optional(),
        cycle: z.string().max(40).optional(),
        discount: z.string().max(40).optional(),
        intent: z.string().max(40).optional(),
        support: z.string().max(40).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const stores = await ctx.prisma.store.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      const where: any = { storeId: { in: stores.map((store) => store.id) } };
      if (input.lifecycle) where.lifecycleStage = input.lifecycle;
      if (input.cycle) where.purchaseCyclePosition = input.cycle;
      if (input.discount) where.discountBehavior = input.discount;
      if (input.intent) where.intentState = input.intent;
      if (input.support) where.supportState = input.support;
      if (input.search) {
        where.customer = {
          OR: [
            { email: { contains: input.search, mode: "insensitive" } },
            { firstName: { contains: input.search, mode: "insensitive" } },
            { lastName: { contains: input.search, mode: "insensitive" } },
          ],
        };
      }
      const [states, total] = await Promise.all([
        ctx.prisma.customerState.findMany({
          where,
          include: {
            customer: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: [{ nextEvaluationAt: "asc" }, { customerId: "asc" }],
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
        ctx.prisma.customerState.count({ where }),
      ]);
      return {
        states,
        total,
        page: input.page,
        pages: Math.ceil(total / input.limit),
      };
    }),

  leftAlone: workspaceProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      const stores = await ctx.prisma.store.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      const storeIds = stores.map((store) => store.id);
      const latestDecisions = await ctx.prisma.customerAudienceDecision.findMany({
        where: { storeId: { in: storeIds } },
        orderBy: { createdAt: "desc" },
        distinct: ["customerId", "contextKey"],
      });
      const decisions = latestDecisions.filter(
        (decision) => decision.decision === "deliberately_left_alone"
      );
      const byCustomer = new Map<string, typeof decisions>();
      for (const decision of decisions) {
        const rows = byCustomer.get(decision.customerId) ?? [];
        rows.push(decision);
        byCustomer.set(decision.customerId, rows);
      }
      const customerIds = [...byCustomer.keys()];
      const total = customerIds.length;
      const pageIds = customerIds.slice((input.page - 1) * input.limit, input.page * input.limit);
      const customers = await ctx.prisma.customer.findMany({
        where: { id: { in: pageIds } },
        include: { customerState: true, rfmScore: true },
      });
      return {
        customers: customers.map((customer) => ({
          ...customer,
          activeDecisions: byCustomer.get(customer.id) ?? [],
        })),
        total,
        pages: Math.ceil(total / input.limit),
        page: input.page,
      };
    }),

  decisionHistory: workspaceProcedure
    .input(z.object({ customerId: z.string(), limit: z.number().min(1).max(200).default(100) }))
    .query(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "customer", input.customerId);
      return ctx.prisma.customerAudienceDecision.findMany({
        where: { customerId: input.customerId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),
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
  getById: workspaceProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    await verifyStoreScopedAccess(ctx, "customer", input.id);
    const customer = await ctx.prisma.customer.findUnique({
      where: { id: input.id },
      include: {
        rfmScore: true,
        lifetimeValue: true,
        customerState: true,
        stateTransitions: { orderBy: { occurredAt: "desc" }, take: 12 },
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

    const [totalCustomers, acceptsMarketing, totalRevenue, avgOrderValue] = await Promise.all([
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
