import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { DEFAULT_SEGMENTS } from "@allohq/customer-intelligence";

const conditionSchema = z.object({
  field: z.enum([
    "rfmSegment",
    "totalSpent",
    "orderCount",
    "avgOrderValue",
    "daysSinceLastOrder",
    "acceptsMarketing",
    "purchasedProduct",
  ]),
  op: z.enum(["equals", "notEquals", "greaterThan", "lessThan", "greaterThanOrEqual", "lessThanOrEqual", "contains"]),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const conditionsSchema = z.object({
  operator: z.enum(["AND", "OR"]),
  conditions: z.array(conditionSchema),
});

/** Build a Prisma where clause from segment conditions */
function buildWhereFromConditions(
  conditions: z.infer<typeof conditionsSchema>,
  storeIds: string[]
) {
  const baseWhere: any = { storeId: { in: storeIds } };
  const clauses: any[] = [];

  for (const cond of conditions.conditions) {
    switch (cond.field) {
      case "rfmSegment":
        clauses.push({ rfmScore: { segment: buildComparison(cond.op, cond.value) } });
        break;
      case "totalSpent":
        clauses.push({ rfmScore: { totalSpent: buildComparison(cond.op, Number(cond.value)) } });
        break;
      case "orderCount":
        clauses.push({ rfmScore: { orderCount: buildComparison(cond.op, Number(cond.value)) } });
        break;
      case "avgOrderValue":
        clauses.push({ rfmScore: { avgOrderValue: buildComparison(cond.op, Number(cond.value)) } });
        break;
      case "daysSinceLastOrder": {
        const daysAgo = Number(cond.value);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
        // "Last purchase more than X days ago" → lastOrderAt < cutoffDate
        if (cond.op === "greaterThan") {
          clauses.push({ rfmScore: { lastOrderAt: { lt: cutoffDate } } });
        } else if (cond.op === "lessThan") {
          clauses.push({ rfmScore: { lastOrderAt: { gt: cutoffDate } } });
        }
        break;
      }
      case "acceptsMarketing":
        clauses.push({ acceptsMarketing: cond.value === true || cond.value === "true" });
        break;
      case "purchasedProduct":
        clauses.push({
          orders: { some: { items: { some: { title: { contains: String(cond.value), mode: "insensitive" } } } } },
        });
        break;
    }
  }

  if (clauses.length === 0) return baseWhere;

  return {
    ...baseWhere,
    [conditions.operator === "AND" ? "AND" : "OR"]: clauses,
  };
}

function buildComparison(op: string, value: any): any {
  switch (op) {
    case "equals": return value;
    case "notEquals": return { not: value };
    case "greaterThan": return { gt: value };
    case "lessThan": return { lt: value };
    case "greaterThanOrEqual": return { gte: value };
    case "lessThanOrEqual": return { lte: value };
    case "contains": return { contains: value, mode: "insensitive" };
    default: return value;
  }
}

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

  /** Create a custom segment */
  create: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        conditions: conditionsSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

      const segment = await ctx.prisma.customerSegment.create({
        data: {
          storeId: input.storeId,
          name: input.name,
          slug,
          description: input.description,
          conditions: input.conditions as any,
          isSystem: false,
        },
      });

      return segment;
    }),

  /** Update a custom segment */
  update: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        conditions: conditionsSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const segment = await ctx.prisma.customerSegment.update({
        where: { id: input.id },
        data: {
          ...(input.name && {
            name: input.name,
            slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
          }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.conditions && { conditions: input.conditions as any }),
        },
      });

      return segment;
    }),

  /** Delete a custom segment */
  delete: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.customerSegment.delete({
        where: { id: input.id },
      });
      return { success: true };
    }),

  /** Preview a segment — count matching customers and return a sample */
  preview: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        conditions: conditionsSchema,
      })
    )
    .query(async ({ ctx, input }) => {
      const stores = await ctx.prisma.store.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      const storeIds = stores.map((s) => s.id);

      const where = buildWhereFromConditions(input.conditions, storeIds);

      const [count, sample] = await Promise.all([
        ctx.prisma.customer.count({ where }),
        ctx.prisma.customer.findMany({
          where,
          take: 5,
          include: {
            rfmScore: { select: { segment: true, totalScore: true, totalSpent: true } },
          },
        }),
      ]);

      return {
        count,
        sample: sample.map((c) => ({
          id: c.id,
          email: c.email,
          firstName: c.firstName,
          lastName: c.lastName,
          segment: c.rfmScore?.segment,
          totalScore: c.rfmScore?.totalScore,
          totalSpent: c.rfmScore?.totalSpent,
        })),
      };
    }),
});
