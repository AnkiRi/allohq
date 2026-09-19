import { prisma } from "@allohq/database";
import type { ToolDefinition } from "../types";

/** A bounded, store-scoped evidence view for merchant campaign reasoning. */
export const customerDecisionTools: ToolDefinition[] = [{
  name: "get_customer_decision_context",
  description:
    "Before deciding what to send a named customer, inspect their current consent, purchase cycle, full-price/discount evidence, recent products, engagement, timing and previous campaign decisions. Customer state is evidence, not a command; deterministic consent and delivery checks still apply later.",
  parameters: {
    customerId: { type: "string", description: "Exact customer ID returned by find_customers." },
  },
  handler: async (params, ctx) => {
    const customerId = String(params.customerId ?? "");
    if (!ctx.storeId || !customerId) return { error: "Store and customer are required" };

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId: ctx.storeId },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        acceptsMarketing: true, rfmScore: true, customerState: true,
        timingProfile: true,
        contactConsents: { where: { channel: "email" }, orderBy: { updatedAt: "desc" }, take: 1 },
        orders: {
          where: { status: { not: "cancelled" } },
          orderBy: { createdAt: "desc" }, take: 10,
          select: {
            id: true, createdAt: true, totalPrice: true, totalDiscounts: true,
            discountCodes: true, status: true, items: {
              take: 5, select: { productId: true, title: true, quantity: true },
            },
          },
        },
      },
    });
    if (!customer) return { found: false };

    const [orderCount, discountedOrderCount, decisions, messages, productSuggestions] = await Promise.all([
      prisma.order.count({ where: { storeId: ctx.storeId, customerId, status: { not: "cancelled" } } }),
      prisma.order.count({ where: { storeId: ctx.storeId, customerId, status: { not: "cancelled" }, totalDiscounts: { gt: 0 } } }),
      prisma.customerAudienceDecision.findMany({
        where: { storeId: ctx.storeId, customerId }, orderBy: { createdAt: "desc" }, take: 5,
        select: { decision: true, reasonCode: true, reasonText: true, contextKey: true, reconsiderAt: true, createdAt: true },
      }),
      prisma.messageLog.findMany({
        where: { storeId: ctx.storeId, customerId, channel: "email" },
        orderBy: { createdAt: "desc" }, take: 5,
        select: { campaignId: true, status: true, sentAt: true, openedAt: true, clickedAt: true, discountCode: true },
      }),
      prisma.customerProductRecommendation.findMany({
        where: { storeId: ctx.storeId, customerId, expiresAt: { gt: new Date() } },
        orderBy: { score: "desc" }, take: 5,
        select: { score: true, strategy: true, reason: true, product: { select: { id: true, title: true } } },
      }),
    ]);

    const state = customer.customerState;
    const latestOrderAt = customer.orders[0]?.createdAt ?? customer.rfmScore?.lastOrderAt;
    const daysSinceLastOrder = latestOrderAt
      ? Math.max(0, Math.floor((Date.now() - latestOrderAt.getTime()) / 86_400_000))
      : null;
    return {
      found: true,
      contextVersion: state?.stateVersion ?? null,
      customer: {
        id: customer.id,
        name: [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email,
        email: customer.email,
        lifecycle: orderCount === 0 ? "subscriber" : (state?.lifecycleStage ?? customer.rfmScore?.segment ?? "unknown"),
        rfmSegment: orderCount === 0 ? null : customer.rfmScore?.segment ?? null,
      },
      consent: {
        acceptsMarketing: customer.acceptsMarketing,
        email: customer.contactConsents[0]?.status ?? "unknown",
        deliveryHealth: state?.deliveryHealth ?? "unknown",
        supportState: state?.supportState ?? "unknown",
      },
      purchase: {
        orderCount,
        ordersWithoutRecordedDiscount: orderCount - discountedOrderCount,
        discountedOrderCount,
        daysSinceLastOrder,
        meanOrderIntervalDays: state?.meanOrderIntervalDays ?? null,
        medianOrderIntervalDays: state?.medianOrderIntervalDays ?? null,
        purchaseCyclePosition: state?.purchaseCyclePosition ?? "unknown",
        reorderConfidence: state?.reorderConfidence ?? 0,
        nextExpectedOrderAt: state?.nextExpectedOrderAt ?? null,
        recentOrders: customer.orders,
      },
      engagement: {
        intent: state?.intentState ?? "unknown",
        fatigue: state?.communicationFatigue ?? null,
        recentEmails: messages,
        timing: customer.timingProfile ? {
          window: customer.timingProfile.window,
          timezone: customer.timingProfile.timezone,
          evidenceCount: customer.timingProfile.evidenceCount,
          confidence: customer.timingProfile.confidence,
        } : null,
      },
      recentDecisions: decisions,
      productSuggestions,
      evidenceLimits: "Recent orders and messages are capped at 10 and 5; discount counts cover all non-cancelled orders. An order without a recorded discount is not proof of a full-price purchase if historical discount sync was incomplete. Missing state or timing data means unknown, not negative evidence.",
      merchantConstraints: ctx.requestConstraints ?? null,
    };
  },
}];
