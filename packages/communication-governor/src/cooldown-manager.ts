import { prisma } from "@allohq/database";
import type { GovernorDecision } from "./types";

/**
 * Enforce cooldown periods:
 * - Post-discount: 14 days after a discount code was sent
 * - Post-complaint: 7 days after a support issue was resolved
 */
export async function checkCooldown(
  customerId: string,
  storeId: string,
  messageType: string,
): Promise<GovernorDecision> {
  // Transactional messages bypass cooldowns
  if (messageType === "transactional") {
    return { allowed: true };
  }

  // Post-discount cooldown: 14 days
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recentDiscount = await prisma.messageLog.findFirst({
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
    select: { sentAt: true },
  });

  if (recentDiscount && recentDiscount.sentAt) {
    const daysAgo = Math.round(
      (Date.now() - recentDiscount.sentAt.getTime()) / (24 * 60 * 60 * 1000),
    );
    const daysRemaining = 14 - daysAgo;
    if (daysRemaining > 0) {
      return {
        allowed: false,
        reason: `Post-discount cooldown: ${daysRemaining} days remaining. Last discount sent ${daysAgo} days ago.`,
        rule: "cooldown_post_discount",
      };
    }
  }

  // Post-complaint cooldown: 7 days after resolution
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
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
      (Date.now() - recentResolved.updatedAt.getTime()) / (24 * 60 * 60 * 1000),
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
