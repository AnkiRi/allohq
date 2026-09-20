import { prisma } from "@allohq/database";
import type { GovernorDecision } from "./types";

export function latestRedeemedOffer(
  offers: readonly { sentAt: Date; discountCode: string }[],
  orders: readonly { createdAt: Date; discountCodes: readonly string[] }[]
) {
  return offers.find((offer) =>
    orders.some(
      (order) =>
        order.createdAt >= offer.sentAt &&
        order.discountCodes.some(
          (code) => code.trim().toUpperCase() === offer.discountCode.trim().toUpperCase()
        )
    )
  );
}

/**
 * Enforce cooldown periods:
 * - Post-discount: 14 days after a discount code from a Joon email was redeemed
 * - Post-complaint: 7 days after a support issue was resolved
 */
export async function checkCooldown(
  customerId: string,
  storeId: string,
  messageType: string,
  /** Evaluation instant; see checkFatigue. */
  now: Date = new Date(),
): Promise<GovernorDecision> {
  // Transactional messages bypass cooldowns
  if (messageType === "transactional") {
    return { allowed: true };
  }

  // Post-discount cooldown: receiving an offer is not enough. Only an actual,
  // traceable redemption may silence the customer for fourteen days.
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const recentDiscountMessages = await prisma.messageLog.findMany({
    where: {
      customerId,
      storeId,
      sentAt: { gte: fourteenDaysAgo },
      metadata: {
        path: ["hasDiscount"],
        equals: true,
      },
    },
    orderBy: { sentAt: "desc" },
    take: 20,
    select: { sentAt: true, metadata: true },
  });
  const offers = recentDiscountMessages.flatMap((message) => {
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;
    const discountCode =
      typeof metadata.discountCode === "string" ? metadata.discountCode.trim() : "";
    return message.sentAt && discountCode
      ? [{ sentAt: message.sentAt, discountCode: discountCode.toUpperCase() }]
      : [];
  });
  const redeemedOrders =
    offers.length > 0
      ? await prisma.order.findMany({
          where: {
            customerId,
            storeId,
            status: { not: "cancelled" },
            createdAt: { gte: fourteenDaysAgo },
            discountCodes: { hasSome: [...new Set(offers.map((offer) => offer.discountCode))] },
          },
          select: { createdAt: true, discountCodes: true },
        })
      : [];
  const recentDiscount = latestRedeemedOffer(offers, redeemedOrders);

  if (recentDiscount) {
    const daysAgo = Math.round(
      (now.getTime() - recentDiscount.sentAt.getTime()) / (24 * 60 * 60 * 1000),
    );
    const daysRemaining = 14 - daysAgo;
    if (daysRemaining > 0) {
      return {
        allowed: false,
        reason: `Post-redemption cooldown: ${daysRemaining} days remaining. Discount redeemed ${daysAgo} days ago.`,
        rule: "cooldown_post_discount",
      };
    }
  }

  // Post-complaint cooldown: 7 days after resolution
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentResolved = await prisma.conversation.findFirst({
    where: {
      customerId,
      storeId,
      status: "resolved",
      updatedAt: { gte: sevenDaysAgo },
    },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  if (recentResolved) {
    const daysAgo = Math.round(
      (now.getTime() - recentResolved.updatedAt.getTime()) / (24 * 60 * 60 * 1000),
    );
    const daysRemaining = 7 - daysAgo;
    if (daysRemaining > 0) {
      return {
        allowed: false,
        reason: `Post-complaint cooldown: ${daysRemaining} days remaining. Support resolved ${daysAgo} days ago.`,
        rule: "cooldown_post_complaint",
      };
    }
  }

  return { allowed: true };
}
