import { prisma } from "@allohq/database";
import type { GovernorDecision, FatigueConfig } from "./types";
import { DEFAULT_FATIGUE_CONFIG } from "./types";

/**
 * Check if a customer has exceeded per-channel fatigue limits.
 * Uses CustomerFatigueLog records from the last 7/30 days.
 */
export async function checkFatigue(
  customerId: string,
  storeId: string,
  channel: string,
  config?: Partial<FatigueConfig>,
): Promise<GovernorDecision> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [weekCount, monthCount] = await Promise.all([
    prisma.customerFatigueLog.count({
      where: { customerId, storeId, channel, sentAt: { gte: sevenDaysAgo } },
    }),
    prisma.customerFatigueLog.count({
      where: { customerId, storeId, channel, sentAt: { gte: thirtyDaysAgo } },
    }),
  ]);

  const limits = {
    ...DEFAULT_FATIGUE_CONFIG,
    ...config,
  };
  const channelLimits = limits[channel as keyof FatigueConfig] ?? limits.email;

  if (weekCount >= channelLimits.weeklyMax) {
    return {
      allowed: false,
      reason: `Weekly ${channel} limit reached (${weekCount}/${channelLimits.weeklyMax})`,
      rule: "fatigue_weekly",
    };
  }

  if (monthCount >= channelLimits.monthlyMax) {
    return {
      allowed: false,
      reason: `Monthly ${channel} limit reached (${monthCount}/${channelLimits.monthlyMax})`,
      rule: "fatigue_monthly",
    };
  }

  return { allowed: true };
}
