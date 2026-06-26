import { prisma } from "@allohq/database";
import type { ToolDefinition } from "../types";

export const segmentTools: ToolDefinition[] = [
  {
    name: "create_segment",
    description:
      "Create a customer segment — EITHER an RFM score range (rfmMin/rfmMax) OR an EXACT list of customers (customerIds). When the merchant names specific people or wants exactly the customers they listed, FIRST call find_customers to get their ids, then pass those ids as customerIds. That creates a manual segment containing EXACTLY those customers — never use an RFM range to approximate a named/explicit set.",
    parameters: {
      name: {
        type: "string",
        description: "Segment name (e.g. 'High-Value At Risk', 'Recent Buyers')",
      },
      description: {
        type: "string",
        description: "What this segment represents",
      },
      rfmMin: {
        type: "number",
        description: "Minimum RFM total score (1-15). Only for RFM-range segments.",
      },
      rfmMax: {
        type: "number",
        description: "Maximum RFM total score (1-15). Only for RFM-range segments.",
      },
      customerIds: {
        type: "array",
        description:
          "Exact customer ids (from find_customers) for a MANUAL segment. When provided, the segment contains EXACTLY these customers and rfmMin/rfmMax are ignored.",
        items: { type: "string" },
      },
    },
    handler: async (params, ctx) => {
      const name = String(params.name ?? "Custom Segment");
      const description = String(params.description ?? "");
      const rawIds = Array.isArray(params.customerIds)
        ? (params.customerIds as unknown[]).map(String).filter(Boolean)
        : [];
      const isManual = rawIds.length > 0;

      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const existing = await prisma.customerSegment.findUnique({
        where: { storeId_slug: { storeId: ctx.storeId, slug } },
      });
      if (existing) {
        return {
          success: false,
          message: `Segment "${name}" already exists with ${existing.customerCount} customers.`,
          segmentId: existing.id,
        };
      }

      // --- MANUAL: exactly the customers the merchant specified ---
      if (isManual) {
        const members = await prisma.customer.findMany({
          where: { id: { in: rawIds }, storeId: ctx.storeId },
          include: { rfmScore: { select: { totalSpent: true } } },
        });
        const memberIds = members.map((m) => m.id);
        const totalRevenue = members.reduce(
          (s, m) => s + (m.rfmScore?.totalSpent ?? 0),
          0,
        );
        const segment = await prisma.customerSegment.create({
          data: {
            storeId: ctx.storeId,
            name,
            slug,
            description,
            kind: "manual",
            customerIds: memberIds,
            customerCount: memberIds.length,
            totalRevenue,
            isSystem: false,
          },
        });
        await prisma.agentAction.create({
          data: {
            storeId: ctx.storeId,
            agentType: "retention_strategist",
            actionType: "create_segment",
            input: { name, customerIds: memberIds },
            output: { segmentId: segment.id, customerCount: memberIds.length },
            status: "completed",
          },
        });
        return {
          success: true,
          segmentId: segment.id,
          name: segment.name,
          customerCount: memberIds.length,
          totalRevenue,
          kind: "manual",
          message: `Segment "${name}" created with EXACTLY ${memberIds.length} customer${memberIds.length === 1 ? "" : "s"} you specified ($${Math.round(totalRevenue).toLocaleString()} revenue).`,
        };
      }

      // --- RFM range (existing behavior) ---
      const rfmMin = Number(params.rfmMin ?? 0);
      const rfmMax = Number(params.rfmMax ?? 15);
      const customerCount = await prisma.rfmScore.count({
        where: { storeId: ctx.storeId, totalScore: { gte: rfmMin, lte: rfmMax } },
      });
      const revenueResult = await prisma.rfmScore.aggregate({
        where: { storeId: ctx.storeId, totalScore: { gte: rfmMin, lte: rfmMax } },
        _sum: { totalSpent: true },
      });
      const segment = await prisma.customerSegment.create({
        data: {
          storeId: ctx.storeId,
          name,
          slug,
          description,
          rfmMin,
          rfmMax,
          kind: "rfm",
          customerCount,
          totalRevenue: revenueResult._sum.totalSpent ?? 0,
          isSystem: false,
        },
      });
      await prisma.agentAction.create({
        data: {
          storeId: ctx.storeId,
          agentType: "retention_strategist",
          actionType: "create_segment",
          input: { name, rfmMin, rfmMax },
          output: { segmentId: segment.id, customerCount },
          status: "completed",
        },
      });
      return {
        success: true,
        segmentId: segment.id,
        name: segment.name,
        customerCount,
        totalRevenue: revenueResult._sum.totalSpent ?? 0,
        rfmRange: `${rfmMin}-${rfmMax}`,
        kind: "rfm",
        message: `Segment "${name}" created with ${customerCount} customers ($${Math.round(revenueResult._sum.totalSpent ?? 0).toLocaleString()} revenue).`,
      };
    },
  },

  {
    name: "list_segments",
    description:
      "List all customer segments with their counts and revenue. Useful for understanding the customer base.",
    parameters: {},
    handler: async (_params, ctx) => {
      const segments = await prisma.customerSegment.findMany({
        where: { storeId: ctx.storeId },
        orderBy: { customerCount: "desc" },
        select: {
          id: true,
          name: true,
          description: true,
          customerCount: true,
          totalRevenue: true,
          isSystem: true,
        },
      });

      return {
        total: segments.length,
        segments: segments.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          customerCount: s.customerCount,
          totalRevenue: s.totalRevenue,
          isSystem: s.isSystem,
        })),
      };
    },
  },
];
