import { prisma } from "@allohq/database";
import type { FatigueState, FatigueChannelState } from "./types";

const CHANNELS = ["email", "whatsapp", "sms", "rcs"] as const;

/**
 * Compute fatigue state for a customer by counting recent sends per channel.
 */
export async function computeFatigueState(
  customerId: string,
  storeId: string,
): Promise<FatigueState> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentLogs = await prisma.customerFatigueLog.findMany({
    where: {
      customerId,
      storeId,
      sentAt: { gte: thirtyDaysAgo },
    },
    select: { channel: true, sentAt: true },
    orderBy: { sentAt: "desc" },
  });

  const state: FatigueState = {};

  for (const ch of CHANNELS) {
    const channelLogs = recentLogs.filter((l) => l.channel === ch);
    const weekLogs = channelLogs.filter((l) => l.sentAt >= sevenDaysAgo);
    const lastLog = channelLogs[0];

    const channelState: FatigueChannelState = {
      lastSent: lastLog ? lastLog.sentAt.toISOString() : null,
      countThisWeek: weekLogs.length,
      countThisMonth: channelLogs.length,
    };
    state[ch] = channelState;
  }

  return state;
}

/**
 * Check if a customer has exceeded fatigue limits for a given channel.
 */
export function isOverFatigueLimit(
  fatigue: FatigueState,
  channel: string,
  limits?: { weeklyMax?: number; monthlyMax?: number },
): boolean {
  const channelFatigue = fatigue[channel];
  if (!channelFatigue) return false;

  const defaults: Record<string, { weeklyMax: number; monthlyMax: number }> = {
    email: { weeklyMax: 3, monthlyMax: 10 },
    whatsapp: { weeklyMax: 1, monthlyMax: 4 },
    sms: { weeklyMax: 2, monthlyMax: 6 },
    rcs: { weeklyMax: 2, monthlyMax: 6 },
  };

  const channelLimits = {
    weeklyMax: limits?.weeklyMax ?? defaults[channel]?.weeklyMax ?? 3,
    monthlyMax: limits?.monthlyMax ?? defaults[channel]?.monthlyMax ?? 10,
  };

  return (
    channelFatigue.countThisWeek >= channelLimits.weeklyMax ||
    channelFatigue.countThisMonth >= channelLimits.monthlyMax
  );
}
