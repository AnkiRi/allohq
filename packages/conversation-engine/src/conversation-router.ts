import { prisma } from "@allohq/database";
import { searchEmbeddings } from "@allohq/agent-brain";
import type { RoutingDecision } from "./types";

const ESCALATION_KEYWORDS = [
  "refund",
  "complaint",
  "lawyer",
  "cancel subscription",
  "sue",
  "legal",
  "report you",
  "unacceptable",
  "speak to manager",
  "speak to human",
  "real person",
  "talk to someone",
];

/**
 * Route an inbound conversation to either AI or merchant based on
 * complexity, customer value, conversation state, and knowledge coverage.
 */
export async function routeConversation(
  storeId: string,
  customerId: string | null,
  conversationId: string,
  message: string,
): Promise<RoutingDecision> {
  // 1. Already assigned to a merchant → stay with merchant
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { assignedTo: true, status: true },
  });

  if (conversation?.assignedTo) {
    return { handler: "merchant", reason: "conversation_claimed", priority: "normal" };
  }

  if (conversation?.status === "escalated") {
    return { handler: "merchant", reason: "already_escalated", priority: "high" };
  }

  // 2. Check for escalation keywords → urgent merchant
  const lowerMsg = message.toLowerCase();
  const hasEscalationKeyword = ESCALATION_KEYWORDS.some((kw) => lowerMsg.includes(kw));
  if (hasEscalationKeyword) {
    return { handler: "merchant", reason: "escalation_keyword_detected", priority: "urgent" };
  }

  // 3. Check customer VIP + unresolved message count
  if (customerId) {
    const [customerState, unresolvedCount] = await Promise.all([
      prisma.customerState.findUnique({
        where: { customerId },
        select: { vipLevel: true },
      }),
      prisma.conversationMessage.count({
        where: {
          conversationId,
          role: "customer",
        },
      }),
    ]);

    const isVip =
      customerState?.vipLevel === "gold" || customerState?.vipLevel === "platinum";
    if (isVip && unresolvedCount >= 3) {
      return { handler: "merchant", reason: "vip_multiple_messages", priority: "high" };
    }
  }

  // 4. Check knowledge base coverage
  const kbResults = await searchEmbeddings(storeId, message, {
    entityType: "faq",
    limit: 3,
    minSimilarity: 0.5,
  });

  if (kbResults.length > 0) {
    return { handler: "ai", reason: "knowledge_base_match", priority: "normal" };
  }

  // 5. Default → AI handles
  return { handler: "ai", reason: "default", priority: "normal" };
}
