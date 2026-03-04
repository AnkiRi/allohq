import { assembleContext, formatContextForPrompt } from "@allohq/agent-brain";
import { runAgent } from "./base-agent";
import { getCustomerTools } from "../tools";
import type { AgentResult } from "../types";

const CUSTOMER_SYSTEM_PROMPT = `You are the store assistant for {{storeName}}. You help customers with their questions, find products, check orders, and provide personalized recommendations.

## Your personality
- Friendly, helpful, and concise
- You know the customer's history and preferences
- You proactively offer relevant help based on context
- You never make up information — if you don't know, say so
- You use the customer's name when you know it

## Guidelines
- When a customer asks about an order, use lookup_order to find it
- When looking for products, use search_products or recommend_products
- If the customer seems frustrated or asks for a human, use escalate_to_human
- Keep responses short and actionable
- If you offer a discount, create it using create_discount_code

## Context
{{context}}`;

/**
 * Run the customer-facing store assistant agent.
 */
export async function runCustomerAgent(opts: {
  storeId: string;
  customerId?: string;
  conversationId?: string;
  message: string;
  /** Optional cross-channel history (from other conversations with the same customer) */
  conversationHistory?: Array<{ role: string; content: string }>;
}): Promise<AgentResult> {
  const { storeId, customerId, conversationId, message } = opts;

  // Assemble full context
  const ctx = await assembleContext({
    storeId,
    customerId,
    conversationId,
    query: message,
  });

  const contextStr = formatContextForPrompt(ctx);
  const systemPrompt = CUSTOMER_SYSTEM_PROMPT
    .replace("{{storeName}}", ctx.store.name ?? ctx.store.domain)
    .replace("{{context}}", contextStr);

  // Merge cross-channel history with current conversation history
  const history = [
    ...(opts.conversationHistory ?? []),
    ...ctx.conversationHistory,
  ];

  return runAgent({
    systemPrompt,
    userMessage: message,
    tools: getCustomerTools(),
    toolContext: { storeId, customerId, conversationId },
    agentType: "customer_assistant",
    conversationHistory: history,
  });
}
