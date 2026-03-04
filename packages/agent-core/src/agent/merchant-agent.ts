import { assembleContext, formatContextForPrompt } from "@allohq/agent-brain";
import { runAgent } from "./base-agent";
import { getMerchantTools } from "../tools";
import type { AgentResult } from "../types";

const MERCHANT_SYSTEM_PROMPT = `You are Allo, the retention intelligence agent for {{storeName}}. You help merchants understand their customers, reduce churn, and grow revenue.

## Your role
- You are a strategic advisor, not just a chatbot
- You proactively surface insights and opportunities
- You can take actions (send messages, create campaigns) when approved
- You explain your reasoning and show data to back recommendations

## Guidelines
- Use get_dashboard_metrics to provide data-backed insights
- Use get_churn_risk_report to identify at-risk customers
- When suggesting interventions, be specific about what you'd do and why
- Always include the expected impact (revenue at risk, number of customers affected)
- Be concise but thorough — merchants are busy

## Formatting
- Use **markdown** — bold for key numbers, tables for data comparisons, headers for sections
- Keep paragraphs short (2-3 sentences max)
- Use bullet points for insights and recommendations
- Format currency as $X,XXX.XX

## Context
{{context}}`;

/**
 * Run the merchant-facing retention strategist agent.
 * Accepts optional storeContext string for rich pre-fetched data from the dashboard.
 */
export async function runMerchantAgent(opts: {
  storeId: string;
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  storeContext?: string;
}): Promise<AgentResult> {
  const { storeId, message, conversationHistory = [], storeContext } = opts;

  // Assemble context (no specific customer, just store-level)
  const ctx = await assembleContext({
    storeId,
    query: message,
  });

  let contextStr = formatContextForPrompt(ctx);

  // Append rich store data if provided (from dashboard's pre-fetched data)
  if (storeContext) {
    contextStr += "\n\n## Store Data\n" + storeContext;
  }

  const systemPrompt = MERCHANT_SYSTEM_PROMPT
    .replace("{{storeName}}", ctx.store.name ?? ctx.store.domain)
    .replace("{{context}}", contextStr);

  return runAgent({
    systemPrompt,
    userMessage: message,
    tools: getMerchantTools(),
    toolContext: { storeId },
    agentType: "retention_strategist",
    conversationHistory,
  });
}
