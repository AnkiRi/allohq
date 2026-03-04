import { prisma } from "@allohq/database";
import { getMemories } from "./customer-memory";
import { searchEmbeddings, type SearchResult } from "../embeddings/search";

/**
 * Full context window assembled for an agent call.
 * Contains everything the agent needs to know to respond.
 */
export interface AgentContext {
  store: {
    id: string;
    name: string | null;
    domain: string;
    description: string | null;
  };
  customer: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    segment: string | null;
    totalSpent: number;
    orderCount: number;
    churnProbability: number;
    ltv: number;
  } | null;
  memories: string[];
  conversationHistory: Array<{ role: string; content: string }>;
  relevantKnowledge: SearchResult[];
}

/**
 * Assemble full context for an agent call.
 * Pulls store info, customer profile + RFM + LTV, memories, conversation history,
 * and RAG results for the current query.
 */
export async function assembleContext(opts: {
  storeId: string;
  customerId?: string;
  conversationId?: string;
  query?: string;
  maxMessages?: number;
}): Promise<AgentContext> {
  const { storeId, customerId, conversationId, query, maxMessages = 20 } = opts;

  // Fetch store info
  const store = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    select: {
      id: true,
      storeName: true,
      shopDomain: true,
      storeDescription: true,
    },
  });

  // Fetch customer profile + intelligence
  let customer: AgentContext["customer"] = null;
  let memories: string[] = [];

  if (customerId) {
    const c = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        rfmScore: true,
        lifetimeValue: true,
      },
    });

    if (c) {
      customer = {
        id: c.id,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        segment: c.rfmScore?.segment ?? null,
        totalSpent: c.rfmScore?.totalSpent ?? 0,
        orderCount: c.rfmScore?.orderCount ?? 0,
        churnProbability: c.lifetimeValue?.churnProbability ?? 0,
        ltv: c.lifetimeValue?.predictedLtv ?? 0,
      };

      // Get customer memories
      const memEntries = await getMemories(customerId);
      memories = memEntries.map((m) => `[${m.memoryType}] ${m.content}`);
    }
  }

  // Get conversation history
  let conversationHistory: Array<{ role: string; content: string }> = [];
  if (conversationId) {
    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: maxMessages,
      select: { role: true, content: true },
    });
    conversationHistory = messages;
  }

  // RAG: search for relevant knowledge
  let relevantKnowledge: SearchResult[] = [];
  if (query) {
    relevantKnowledge = await searchEmbeddings(storeId, query, {
      limit: 5,
      minSimilarity: 0.3,
    });
  }

  return {
    store: {
      id: store.id,
      name: store.storeName,
      domain: store.shopDomain,
      description: store.storeDescription,
    },
    customer,
    memories,
    conversationHistory,
    relevantKnowledge,
  };
}

/** Format context into a system prompt string for the LLM */
export function formatContextForPrompt(ctx: AgentContext): string {
  const parts: string[] = [];

  // Store info
  parts.push(`## Store: ${ctx.store.name ?? ctx.store.domain}`);
  if (ctx.store.description) {
    parts.push(ctx.store.description);
  }

  // Customer info
  if (ctx.customer) {
    parts.push(`\n## Customer Profile`);
    parts.push(`- Name: ${ctx.customer.firstName ?? ""} ${ctx.customer.lastName ?? ""}`.trim());
    parts.push(`- Email: ${ctx.customer.email}`);
    if (ctx.customer.phone) parts.push(`- Phone: ${ctx.customer.phone}`);
    parts.push(`- Segment: ${ctx.customer.segment ?? "Unknown"}`);
    parts.push(`- Total spent: $${ctx.customer.totalSpent.toFixed(2)}`);
    parts.push(`- Orders: ${ctx.customer.orderCount}`);
    parts.push(`- Churn risk: ${(ctx.customer.churnProbability * 100).toFixed(0)}%`);
    parts.push(`- Predicted LTV: $${ctx.customer.ltv.toFixed(2)}`);
  }

  // Memories
  if (ctx.memories.length > 0) {
    parts.push(`\n## Customer Notes`);
    for (const m of ctx.memories) {
      parts.push(`- ${m}`);
    }
  }

  // Relevant knowledge
  if (ctx.relevantKnowledge.length > 0) {
    parts.push(`\n## Relevant Knowledge`);
    for (const k of ctx.relevantKnowledge) {
      parts.push(`[${k.entityType}] ${k.chunk}`);
    }
  }

  return parts.join("\n");
}
