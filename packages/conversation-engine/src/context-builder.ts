import { prisma } from "@allohq/database";
import type { ConversationContext } from "./types";

/**
 * Build full conversation context for the context sidebar and AI agent.
 * Extends beyond base assembleContext with orders, state, support history, journeys.
 */
export async function buildConversationContext(
  storeId: string,
  customerId: string | null,
  conversationId: string,
): Promise<ConversationContext> {
  // Fetch everything in parallel
  const [customer, state, orders, recentMessages, supportHistory, activeJourneys] =
    await Promise.all([
      customerId
        ? prisma.customer.findUnique({
            where: { id: customerId },
            include: { rfmScore: true, lifetimeValue: true },
          })
        : null,
      customerId
        ? prisma.customerState.findUnique({
            where: { customerId },
            select: {
              lifecycleStage: true,
              churnRisk: true,
              trustScore: true,
              supportState: true,
              vipLevel: true,
            },
          })
        : null,
      customerId
        ? prisma.order.findMany({
            where: { customerId, storeId },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
              id: true,
              orderNumber: true,
              status: true,
              totalPrice: true,
              createdAt: true,
              items: {
                select: { title: true, quantity: true, price: true },
                take: 5,
              },
            },
          })
        : [],
      prisma.conversationMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { role: true, content: true, createdAt: true },
      }),
      customerId
        ? prisma.conversation
            .groupBy({
              by: ["status"],
              where: { customerId, storeId },
              _count: true,
            })
            .then((groups) => {
              const total = groups.reduce((sum, g) => sum + g._count, 0);
              const resolved =
                groups.find((g) => g.status === "resolved")?._count ?? 0;
              return { totalConversations: total, resolvedCount: resolved };
            })
        : { totalConversations: 0, resolvedCount: 0 },
      customerId
        ? prisma.customerJourney.findMany({
            where: { customerId, status: { in: ["active", "paused"] } },
            select: { journeyType: true, currentStep: true, status: true },
            take: 5,
          })
        : [],
    ]);

  return {
    customer: customer
      ? {
          id: customer.id,
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          phone: customer.phone,
          segment: customer.rfmScore?.segment ?? null,
          totalSpent: customer.rfmScore?.totalSpent ?? 0,
          orderCount: customer.rfmScore?.orderCount ?? 0,
          churnRisk: customer.lifetimeValue?.churnProbability ?? 0,
          ltv: customer.lifetimeValue?.predictedLtv ?? 0,
        }
      : null,
    state,
    orders,
    recentMessages: recentMessages.reverse(),
    supportHistory,
    activeJourneys,
  };
}
