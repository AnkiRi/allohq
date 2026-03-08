import { prisma } from "@allohq/database";
import type { GovernorDecision } from "./types";

/**
 * Prevent sending 2 campaigns to the same customer within 48 hours.
 * Queries MessageLog for recent campaign sends on any channel.
 */
export async function checkCollision(
  customerId: string,
  storeId: string,
  windowHours: number = 48,
): Promise<GovernorDecision> {
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const recentCampaignSend = await prisma.messageLog.findFirst({
    where: {
      customerId,
      storeId,
      campaignId: { not: null },
      status: { in: ["sent", "delivered", "opened", "clicked"] },
      sentAt: { gte: windowStart },
    },
    orderBy: { sentAt: "desc" },
    select: { campaignId: true, channel: true, sentAt: true },
  });

  if (recentCampaignSend) {
    const hoursAgo = Math.round(
      (Date.now() - recentCampaignSend.sentAt!.getTime()) / (60 * 60 * 1000),
    );
    return {
      allowed: false,
      reason: `Customer received campaign ${recentCampaignSend.campaignId} via ${recentCampaignSend.channel} ${hoursAgo}h ago. Minimum ${windowHours}h gap between campaigns.`,
      rule: "collision_48h",
    };
  }

  return { allowed: true };
}
