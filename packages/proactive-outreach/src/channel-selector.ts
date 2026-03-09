import { prisma } from "@allohq/database";
import type { Channel } from "@allohq/messaging";

/**
 * Select the best channel for a customer based on their channel preferences.
 * Falls back to email if no preference data or no phone for sms/whatsapp/rcs.
 */
export async function selectBestChannel(
  customerId: string,
): Promise<Channel> {
  const [state, customer] = await Promise.all([
    prisma.customerState.findUnique({
      where: { customerId },
      select: { channelPreference: true },
    }),
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { phone: true, email: true },
    }),
  ]);

  if (!state || !customer) return "email";

  const prefs = (state.channelPreference ?? {}) as Record<string, number>;
  const hasPhone = !!customer.phone;

  // Sort channels by preference score descending
  const channels: Array<{ channel: Channel; score: number }> = [];

  for (const [ch, score] of Object.entries(prefs)) {
    if (typeof score !== "number" || score <= 0) continue;

    // Skip phone-based channels if no phone
    if ((ch === "sms" || ch === "whatsapp" || ch === "rcs") && !hasPhone) {
      continue;
    }

    channels.push({ channel: ch as Channel, score });
  }

  channels.sort((a, b) => b.score - a.score);

  return channels[0]?.channel ?? "email";
}
