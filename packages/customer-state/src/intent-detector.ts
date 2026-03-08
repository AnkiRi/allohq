import { prisma } from "@allohq/database";
import { IntentState } from "./types";

/**
 * Detect customer intent from available data (orders, email engagement, support state).
 * Full browse event tracking will be added when the widget is built.
 */
export async function detectIntent(
  customerId: string,
  storeId: string,
): Promise<IntentState> {
  // Check for open support issues first
  const openConversations = await prisma.conversation.count({
    where: {
      customerId,
      storeId,
      status: "active",
    },
  });

  if (openConversations > 0) {
    return IntentState.NEEDS_HELP;
  }

  // Check recent email engagement (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentEngagement = await prisma.messageLog.findMany({
    where: {
      customerId,
      storeId,
      createdAt: { gte: thirtyDaysAgo },
      status: { in: ["opened", "clicked"] },
    },
    select: { status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Check for abandoned carts
  const recentAbandonedCarts = await prisma.abandonedCheckout.count({
    where: {
      customerId,
      storeId,
      recoveredAt: null,
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  // Recent clicks suggest ready to buy or considering
  const recentClicks = recentEngagement.filter((e) => e.status === "clicked").length;
  const recentOpens = recentEngagement.filter((e) => e.status === "opened").length;

  if (recentAbandonedCarts > 0 || recentClicks >= 3) {
    return IntentState.READY_TO_BUY;
  }

  if (recentClicks >= 1 || recentOpens >= 3) {
    return IntentState.CONSIDERING;
  }

  if (recentOpens >= 1) {
    return IntentState.BROWSING;
  }

  return IntentState.INACTIVE;
}
