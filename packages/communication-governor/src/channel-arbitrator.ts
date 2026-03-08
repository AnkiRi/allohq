import { prisma } from "@allohq/database";
import type { GovernorDecision } from "./types";

/**
 * Prevent duplicate sends across channels within a timeframe.
 * If a customer received a message on any channel in the last N hours,
 * block sending on another channel for the same campaign purpose.
 */
export async function checkChannelCollision(
  customerId: string,
  storeId: string,
  channel: string,
  windowHours: number = 2,
): Promise<GovernorDecision> {
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  // Check if any message was sent on a DIFFERENT channel in the window
  const recentCrossChannel = await prisma.customerFatigueLog.findFirst({
    where: {
      customerId,
      storeId,
      channel: { not: channel },
      sentAt: { gte: windowStart },
    },
    orderBy: { sentAt: "desc" },
  });

  if (recentCrossChannel) {
    return {
      allowed: false,
      reason: `Customer received ${recentCrossChannel.channel} message ${Math.round((Date.now() - recentCrossChannel.sentAt.getTime()) / 60000)} minutes ago. Wait ${windowHours}h between cross-channel sends.`,
      rule: "channel_arbitration",
    };
  }

  return { allowed: true };
}
