import { prisma } from "@allohq/database";
import type { ToolDefinition } from "../types";

export const segmentTools: ToolDefinition[] = [
  {
    name: "create_segment",
    description:
      "Create a custom customer segment with RFM-based or custom conditions. Returns the new segment with its customer count.",
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
        description: "Minimum RFM total score (1-15, optional)",
      },
      rfmMax: {
        type: "number",
        description: "Maximum RFM total score (1-15, optional)",
      },
    },
    handler: async (params, ctx) => {
      const name = String(params.name ?? "Custom Segment");
      const description = String(params.description ?? "");
      const rfmMin = Number(params.rfmMin ?? 0);
      const rfmMax = Number(params.rfmMax ?? 15);

      // Generate slug
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      // Check for duplicate
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

      // Count matching customers
      const customerCount = await prisma.rfmScore.count({
        where: {
          storeId: ctx.storeId,
          totalScore: { gte: rfmMin, lte: rfmMax },
        },
      });

      // Calculate revenue for matching customers
      const revenueResult = await prisma.rfmScore.aggregate({
        where: {
          storeId: ctx.storeId,
          totalScore: { gte: rfmMin, lte: rfmMax },
        },
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
          customerCount,
          totalRevenue: revenueResult._sum.totalSpent ?? 0,
          isSystem: false,
        },
      });

      // Log action
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
