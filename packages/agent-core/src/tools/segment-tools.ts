import { prisma, buildWhereFromConditions, type SegmentConditions } from "@allohq/database";
import type { ToolDefinition } from "../types";

export const segmentTools: ToolDefinition[] = [
  {
    name: "create_segment",
    description:
      "Create a customer segment. A segment MUST be defined EXPLICITLY one of two ways: (1) customerIds — an EXACT list of people (call find_customers first for named/specific/'top N' customers, then pass their ids); or (2) conditions — a rule set for criteria-based audiences (spend, orders, recency, or an RFM segment name like 'Champions'). There is NO broad/catch-all option: if you don't provide customerIds or conditions, the tool refuses. Never approximate a named/specific/top-N ask with a broad segment.",
    parameters: {
      name: {
        type: "string",
        description: "The segment's name — ALWAYS use the EXACT name the merchant specified (e.g. they said 'call it VIPs' → name='VIPs'). Only invent a short descriptive name if they gave none. NEVER leave this blank or generic.",
      },
      description: {
        type: "string",
        description: "What this segment represents",
      },
      customerIds: {
        type: "array",
        description:
          "Exact customer ids (from find_customers) for a MANUAL segment of EXACTLY these people. Use for named/specific/'top N' customers.",
        items: { type: "string" },
      },
      conditions: {
        type: "object",
        description:
          "Rule-based definition for a CRITERIA segment. Shape: { operator: 'AND'|'OR', conditions: [{ field, op, value }] }. Fields: 'totalSpent' | 'orderCount' | 'avgOrderValue' | 'daysSinceLastOrder' | 'rfmSegment' (value = a segment name e.g. 'Champions') | 'acceptsMarketing' | 'purchasedProduct'. Ops: 'equals'|'notEquals'|'greaterThan'|'lessThan'|'greaterThanOrEqual'|'lessThanOrEqual'|'contains'. Example — high spenders over ₹20k: { operator:'AND', conditions:[{field:'totalSpent',op:'greaterThan',value:20000}] }.",
      },
    },
    handler: async (params, ctx) => {
      const description = String(params.description ?? "");
      const rawIds = Array.isArray(params.customerIds)
        ? (params.customerIds as unknown[]).map(String).filter(Boolean)
        : [];
      const isManual = rawIds.length > 0;
      const conditions: SegmentConditions | null =
        params.conditions &&
        typeof params.conditions === "object" &&
        Array.isArray((params.conditions as { conditions?: unknown }).conditions)
          ? (params.conditions as SegmentConditions)
          : null;

      // GUARDRAIL: a segment MUST have an explicit definition. No silent broad-RFM
      // fallback — that is what produced bogus "Custom Segment" 300+ blobs for
      // requests that were actually for specific or top-N customers.
      if (!isManual && !conditions) {
        return {
          success: false,
          message:
            "To create a segment, give it an explicit definition. For specific people or 'top N' customers, call find_customers first and pass customerIds. For a rule-based audience (e.g. spend over ₹20k, or the 'Champions' RFM segment), pass conditions. I won't create a broad catch-all segment.",
        };
      }

      // Respect the merchant's name; only fall back to a descriptive default when none given.
      const name =
        String(params.name ?? "").trim() || (isManual ? "Selected customers" : "Custom segment");

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

      // --- CONDITIONS: rule-based, resolved by the SAME query as the builder
      //     preview, so the created count always equals the preview count. ---
      const where = buildWhereFromConditions(conditions!, [ctx.storeId]);
      const members = await prisma.customer.findMany({
        where,
        select: { rfmScore: { select: { totalSpent: true } } },
      });
      const customerCount = members.length;
      const totalRevenue = members.reduce((s, m) => s + (m.rfmScore?.totalSpent ?? 0), 0);
      const segment = await prisma.customerSegment.create({
        data: {
          storeId: ctx.storeId,
          name,
          slug,
          description,
          kind: "conditions",
          conditions: conditions as any,
          customerCount,
          totalRevenue,
          isSystem: false,
        },
      });
      await prisma.agentAction.create({
        data: {
          storeId: ctx.storeId,
          agentType: "retention_strategist",
          actionType: "create_segment",
          input: { name, conditions: conditions as any },
          output: { segmentId: segment.id, customerCount },
          status: "completed",
        },
      });
      return {
        success: true,
        segmentId: segment.id,
        name: segment.name,
        customerCount,
        totalRevenue,
        kind: "conditions",
        message: `Segment "${name}" created with ${customerCount} customer${customerCount === 1 ? "" : "s"} ($${Math.round(totalRevenue).toLocaleString()} revenue).`,
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
