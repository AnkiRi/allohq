import { prisma } from "@allohq/database";
import type { GovernorDecision } from "./types";

/**
 * Suppress marketing messages if customer has an open support issue
 * or a recent complaint. Transactional messages are always allowed.
 */
export async function checkSupportState(
  customerId: string,
  storeId: string,
  messageType: string,
): Promise<GovernorDecision> {
  // Transactional messages bypass support suppression
  if (messageType === "transactional") {
    return { allowed: true };
  }

  // Check CustomerState first (fast path)
  const state = await prisma.customerState.findUnique({
    where: { customerId },
    select: { supportState: true },
  });

  if (state) {
    if (state.supportState === "open_issue") {
      return {
        allowed: false,
        reason: "Customer has an open support issue. Marketing suppressed until resolved.",
        rule: "support_open_issue",
      };
    }
    if (state.supportState === "escalated") {
      return {
        allowed: false,
        reason: "Customer has an escalated support case. All marketing suppressed.",
        rule: "support_escalated",
      };
    }
    if (state.supportState === "recent_complaint") {
      return {
        allowed: false,
        reason: "Customer had a recent support interaction. Marketing suppressed for 7 days.",
        rule: "support_recent_complaint",
      };
    }
    return { allowed: true };
  }

  // Fallback: check conversations directly if no CustomerState exists
  const activeConversation = await prisma.conversation.findFirst({
    where: { customerId, storeId, status: "active" },
  });

  if (activeConversation) {
    return {
      allowed: false,
      reason: "Customer has an active support conversation. Marketing suppressed.",
      rule: "support_active_conversation",
    };
  }

  return { allowed: true };
}
