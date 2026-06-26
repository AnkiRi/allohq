import { prisma } from "@allohq/database";
import { searchEmbeddings } from "@allohq/agent-brain";
import type { ToolDefinition } from "../types";

export const customerTools: ToolDefinition[] = [
  {
    name: "get_customer_info",
    description:
      "Get the current customer's profile, order history summary, RFM segment, and lifetime value.",
    parameters: {},
    handler: async (_params, ctx) => {
      if (!ctx.customerId) return { error: "No customer identified" };

      const customer = await prisma.customer.findUnique({
        where: { id: ctx.customerId },
        include: {
          rfmScore: true,
          lifetimeValue: true,
          orders: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              orderNumber: true,
              totalPrice: true,
              status: true,
              createdAt: true,
            },
          },
        },
      });

      if (!customer) return { found: false };

      return {
        found: true,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        segment: customer.rfmScore?.segment,
        totalSpent: customer.rfmScore?.totalSpent ?? 0,
        orderCount: customer.rfmScore?.orderCount ?? 0,
        avgOrderValue: customer.rfmScore?.avgOrderValue ?? 0,
        churnProbability: customer.lifetimeValue?.churnProbability ?? 0,
        predictedLtv: customer.lifetimeValue?.predictedLtv ?? 0,
        recentOrders: customer.orders,
      };
    },
  },

  {
    name: "find_customers",
    description:
      "Search the store's customers by name or email (partial, case-insensitive). Returns each match's id, name, email, and RFM segment. ALWAYS use this when the merchant names specific people or wants an EXACT set (e.g. 'Archana S', 'these 10 customers'), then pass the returned ids to create_segment (customerIds) or create_campaign_with_preview (customerIds). NEVER approximate named or explicitly-listed customers with an RFM segment.",
    parameters: {
      query: {
        type: "string",
        description: "Name or email fragment to match (case-insensitive).",
      },
      limit: {
        type: "number",
        description: "Max results to return (default 25, max 100).",
      },
    },
    handler: async (params, ctx) => {
      if (!ctx.storeId) return { error: "No store in context" };
      const query = String(params.query ?? "").trim();
      const take = Math.min(Math.max(Number(params.limit ?? 25), 1), 100);
      const customers = await prisma.customer.findMany({
        where: {
          storeId: ctx.storeId,
          ...(query
            ? {
                OR: [
                  { firstName: { contains: query, mode: "insensitive" } },
                  { lastName: { contains: query, mode: "insensitive" } },
                  { email: { contains: query, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: { rfmScore: { select: { segment: true, totalSpent: true } } },
        take,
      });
      return {
        count: customers.length,
        customers: customers.map((c) => ({
          id: c.id,
          name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email,
          email: c.email,
          segment: c.rfmScore?.segment ?? null,
          totalSpent: c.rfmScore?.totalSpent ?? 0,
        })),
      };
    },
  },

  {
    name: "recommend_products",
    description:
      "Get product recommendations for the customer based on their preferences and purchase history. Uses semantic search to find relevant products.",
    parameters: {
      context: {
        type: "string",
        description: "What the customer is looking for or interested in",
      },
    },
    handler: async (params, ctx) => {
      const query = String(params.context ?? "popular products");

      // Use RAG to find relevant products
      const results = await searchEmbeddings(ctx.storeId, query, {
        entityType: "product",
        limit: 5,
        minSimilarity: 0.2,
      });

      return results.map((r) => ({
        title: (r.metadata as Record<string, unknown>).title,
        price: (r.metadata as Record<string, unknown>).price,
        imageUrl: (r.metadata as Record<string, unknown>).imageUrl,
        handle: (r.metadata as Record<string, unknown>).handle,
        relevance: r.similarity.toFixed(2),
        description: r.chunk,
      }));
    },
  },

  {
    name: "escalate_to_human",
    description:
      "Escalate the conversation to a human agent. Use when the customer explicitly asks for a human, is frustrated, or the issue requires human judgment (refunds, complaints).",
    parameters: {
      reason: { type: "string", description: "Why the conversation is being escalated" },
    },
    handler: async (params, ctx) => {
      if (!ctx.conversationId) return { error: "No active conversation" };

      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { status: "escalated" },
      });

      return {
        escalated: true,
        reason: params.reason,
        message: "A human agent will be with you shortly.",
      };
    },
  },
];
