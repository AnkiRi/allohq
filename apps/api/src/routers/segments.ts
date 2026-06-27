import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Queue } from "bullmq";
import { router, workspaceProcedure, storeProcedure } from "../trpc";
import { DEFAULT_SEGMENTS } from "@allohq/customer-intelligence";

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

const productSegmentsQueue = new Queue("product-segments", { connection: redisConnection });

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

/**
 * ONE place that resolves a segment's members → a Prisma customer `where`,
 * regardless of how the segment is defined: explicit list (customerIds) →
 * conditions → RFM range. Used by getById (members), create/update (count) and
 * preview so the SAME query answers, builds, and displays — counts always match.
 */
function resolveSegmentWhere(
  segment: { customerIds?: string[] | null; conditions?: unknown; rfmMin?: number | null; rfmMax?: number | null },
  storeIds: string[],
): any {
  if (segment.customerIds && segment.customerIds.length > 0) {
    return { storeId: { in: storeIds }, id: { in: segment.customerIds } };
  }
  if (segment.conditions) {
    return buildWhereFromConditions(segment.conditions as z.infer<typeof conditionsSchema>, storeIds);
  }
  return {
    storeId: { in: storeIds },
    rfmScore: { totalScore: { gte: segment.rfmMin ?? 0, lte: segment.rfmMax ?? 15 } },
  };
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

  /** Get one segment + its RESOLVED members (works for every segment kind). */
  getById: workspaceProcedure
    .input(z.object({ id: z.string(), membersLimit: z.number().min(1).max(500).default(100) }))
    .query(async ({ ctx, input }) => {
      const stores = await ctx.prisma.store.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      const storeIds = stores.map((s) => s.id);
      const segment = await ctx.prisma.customerSegment.findFirst({
        where: { id: input.id, storeId: { in: storeIds } },
      });
      if (!segment) return null;

      const where = resolveSegmentWhere(segment as any, storeIds);
      const [count, members] = await Promise.all([
        ctx.prisma.customer.count({ where }),
        ctx.prisma.customer.findMany({
          where,
          take: input.membersLimit,
          include: { rfmScore: { select: { segment: true, totalSpent: true, orderCount: true, lastOrderAt: true } } },
          orderBy: { rfmScore: { totalSpent: "desc" } },
        }),
      ]);

      return {
        segment,
        count,
        members: members.map((m) => ({
          id: m.id,
          name: [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email,
          email: m.email,
          segment: m.rfmScore?.segment ?? null,
          totalSpent: m.rfmScore?.totalSpent ?? 0,
          orderCount: m.rfmScore?.orderCount ?? 0,
        })),
      };
    }),

  /** Initialize default segments for a store */
  initDefaults: storeProcedure
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
  create: storeProcedure
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

      // Resolve the member count NOW via the SAME query preview uses, so the
      // created segment's count always equals the preview the user just saw.
      const where = buildWhereFromConditions(input.conditions, [input.storeId]);
      const customerCount = await ctx.prisma.customer.count({ where });

      const segment = await ctx.prisma.customerSegment.create({
        data: {
          storeId: input.storeId,
          name: input.name,
          slug,
          description: input.description,
          conditions: input.conditions as any,
          kind: "conditions",
          customerCount,
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
      // Recompute the count via the same query when the definition changes, so an
      // edited segment's count stays consistent with what a preview would show.
      let recount: Record<string, unknown> = {};
      if (input.conditions) {
        const existing = await ctx.prisma.customerSegment.findUnique({
          where: { id: input.id },
          select: { storeId: true },
        });
        if (existing) {
          const where = buildWhereFromConditions(input.conditions, [existing.storeId]);
          recount = { customerCount: await ctx.prisma.customer.count({ where }), kind: "conditions" };
        }
      }
      const segment = await ctx.prisma.customerSegment.update({
        where: { id: input.id },
        data: {
          ...(input.name && {
            name: input.name,
            slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
          }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.conditions && { conditions: input.conditions as any }),
          ...recount,
        },
      });

      return segment;
    }),

  /** Delete a custom segment */
  delete: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Ownership: the segment must belong to one of THIS workspace's stores (no IDOR).
      const stores = await ctx.prisma.store.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      const storeIds = stores.map((s) => s.id);
      const segment = await ctx.prisma.customerSegment.findFirst({
        where: { id: input.id, storeId: { in: storeIds } },
      });
      if (!segment) throw new TRPCError({ code: "NOT_FOUND", message: "Segment not found" });
      if (segment.isSystem) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Built-in segments can't be deleted." });
      }

      // In-use guard: don't orphan campaigns/automations that target this segment.
      const campaignsUsing = await ctx.prisma.campaign.count({ where: { segmentId: input.id } });
      const autos = await ctx.prisma.automation.findMany({
        where: { storeId: segment.storeId },
        select: { triggerConfig: true },
      });
      const autosUsing = autos.filter((a) => JSON.stringify(a.triggerConfig ?? {}).includes(input.id)).length;
      if (campaignsUsing > 0 || autosUsing > 0) {
        const parts: string[] = [];
        if (campaignsUsing) parts.push(`${campaignsUsing} campaign${campaignsUsing === 1 ? "" : "s"}`);
        if (autosUsing) parts.push(`${autosUsing} automation${autosUsing === 1 ? "" : "s"}`);
        throw new TRPCError({
          code: "CONFLICT",
          message: `Can't delete — this segment is used by ${parts.join(" and ")}. Remove it there first.`,
        });
      }

      await ctx.prisma.customerSegment.delete({ where: { id: input.id } });
      return { success: true };
    }),

  /** Get basket archetypes for the workspace's stores */
  getBasketArchetypes: workspaceProcedure.query(async ({ ctx }) => {
    const stores = await ctx.prisma.store.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    const storeIds = stores.map((s) => s.id);

    const archetypes = await ctx.prisma.basketArchetype.findMany({
      where: { storeId: { in: storeIds }, isActive: true },
      orderBy: { frequency: "desc" },
    });

    return archetypes;
  }),

  /** List product-based smart segments for the workspace */
  getProductSegments: workspaceProcedure
    .input(z.object({ storeId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const stores = await ctx.prisma.store.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      const storeIds = input?.storeId ? [input.storeId] : stores.map((s) => s.id);

      const segments = await ctx.prisma.productSegment.findMany({
        where: { storeId: { in: storeIds }, isActive: true },
        orderBy: { customerCount: "desc" },
        include: {
          _count: { select: { members: true } },
        },
      });

      return segments.map((s) => ({
        id: s.id,
        storeId: s.storeId,
        name: s.name,
        slug: s.slug,
        description: s.description,
        segmentType: s.segmentType,
        conditions: s.conditions,
        customerCount: s.customerCount,
        totalRevenue: s.totalRevenue,
        avgOrderValue: s.avgOrderValue,
        insights: s.insights,
        memberCount: s._count.members,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
    }),

  /** Get a single product segment with member details */
  getProductSegmentById: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const segment = await ctx.prisma.productSegment.findUnique({
        where: { id: input.id },
        include: {
          members: {
            take: 50,
            orderBy: { score: "desc" },
          },
        },
      });

      if (!segment) {
        throw new Error("Product segment not found");
      }

      // Verify workspace access
      const store = await ctx.prisma.store.findFirst({
        where: { id: segment.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) {
        throw new Error("Access denied");
      }

      return segment;
    }),

  /** Trigger a refresh of product segments for a store */
  refreshProductSegments: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify workspace access
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) {
        throw new Error("Store not found");
      }

      await productSegmentsQueue.add("refresh", { storeId: input.storeId }, { attempts: 3 });

      return { success: true, message: "Product segment analysis queued" };
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
