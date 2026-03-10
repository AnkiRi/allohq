import { runCustomerAgent } from "@allohq/agent-core";
import { retrieve } from "@allohq/agent-brain";
import type { AgentResult } from "@allohq/agent-core";

/**
 * Generate an AI response for a customer message.
 * Wraps runCustomerAgent with knowledge base retrieval and strict guardrails.
 */
export async function generateResponse(opts: {
  storeId: string;
  customerId?: string;
  conversationId: string;
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}): Promise<{
  response: string;
  confidence: number;
  toolCalls: string[];
  agentResult: AgentResult;
}> {
  const { storeId, customerId, conversationId, message, conversationHistory } = opts;

  // Retrieve knowledge base articles for context injection
  const kbResult = await retrieve(storeId, message, {
    entityTypes: ["faq"],
    limit: 5,
    minSimilarity: 0.3,
  });

  // Prepend knowledge base context to the message for the agent
  let enhancedMessage = message;
  if (kbResult.sources.length > 0) {
    const kbContext = kbResult.sources
      .map((s) => `[Knowledge Base] ${s.chunk}`)
      .join("\n");
    enhancedMessage = `IMPORTANT INSTRUCTIONS:
- ONLY answer with information from: order data, product data, knowledge base articles below.
- NEVER guess or hallucinate information. If you are unsure, say "Let me connect you with our team."
- If the customer's question matches a knowledge base article, use that information.

## Knowledge Base Articles
${kbContext}

## Customer Message
${message}`;
  }

  const agentResult = await runCustomerAgent({
    storeId,
    customerId,
    conversationId,
    message: enhancedMessage,
    conversationHistory,
  });

  // Check if agent used escalate_to_human tool → confidence = 0
  const toolCalls = agentResult.toolCalls?.map((tc) => tc.name) ?? [];
  const escalated = toolCalls.includes("escalate_to_human");
  const confidence = escalated ? 0 : kbResult.sources.length > 0 ? 0.9 : 0.6;

  return {
    response: agentResult.response,
    confidence,
    toolCalls,
    agentResult,
  };
}
