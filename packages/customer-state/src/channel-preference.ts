import { prisma } from "@allohq/database";
import type { ChannelPreference } from "./types";

/**
 * Compute per-channel engagement scores from MessageLog open/click rates.
 * Returns a normalized 0-1 score per channel.
 */
export async function computeChannelPreference(
  customerId: string,
  storeId: string,
): Promise<ChannelPreference> {
  const logs = await prisma.messageLog.findMany({
    where: {
      customerId,
      storeId,
      status: { in: ["sent", "delivered", "opened", "clicked"] },
    },
    select: { channel: true, status: true },
  });

  const channels = ["email", "whatsapp", "sms", "rcs"] as const;
  const scores: Record<string, number> = {};

  for (const ch of channels) {
    const channelLogs = logs.filter((l) => l.channel === ch);
    if (channelLogs.length === 0) {
      // No data — neutral score
      scores[ch] = ch === "email" ? 0.5 : 0.25;
      continue;
    }
    const sent = channelLogs.length;
    const opened = channelLogs.filter((l) => l.status === "opened" || l.status === "clicked").length;
    const clicked = channelLogs.filter((l) => l.status === "clicked").length;

    // Weighted engagement: opens worth 0.4, clicks worth 0.6
    const openRate = sent > 0 ? opened / sent : 0;
    const clickRate = sent > 0 ? clicked / sent : 0;
    scores[ch] = Math.min(1, openRate * 0.4 + clickRate * 0.6);
  }

  // Normalize so scores sum to 1
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  if (total > 0) {
    for (const ch of channels) {
      scores[ch] = (scores[ch] ?? 0) / total;
    }
  }

  return {
    email: Math.round((scores["email"] ?? 0) * 100) / 100,
    whatsapp: Math.round((scores["whatsapp"] ?? 0) * 100) / 100,
    sms: Math.round((scores["sms"] ?? 0) * 100) / 100,
    rcs: Math.round((scores["rcs"] ?? 0) * 100) / 100,
  };
}
