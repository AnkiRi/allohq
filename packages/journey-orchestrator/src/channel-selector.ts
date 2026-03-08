import { prisma } from "@allohq/database";
import { checkAllRules } from "@allohq/communication-governor";
import type { ChannelPreference } from "@allohq/customer-state";
import type { Channel } from "@allohq/messaging";
import type { ChannelSelection } from "./types";

const CHANNELS: Channel[] = ["email", "whatsapp", "sms", "rcs"];

/**
 * Select the best channel for a customer based on:
 * 1. CustomerState.channelPreference scores
 * 2. Contact availability (has email, has phone)
 * 3. Governor rules (fatigue, quiet hours, etc.)
 */
export async function selectChannel(
  customerId: string,
  storeId: string,
): Promise<ChannelSelection[]> {
  // Load customer state and contact info
  const [state, customer] = await Promise.all([
    prisma.customerState.findUnique({
      where: { customerId },
      select: { channelPreference: true },
    }),
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { email: true, phone: true, acceptsMarketing: true },
    }),
  ]);

  if (!customer) {
    return [];
  }

  const prefs = (state?.channelPreference as unknown as ChannelPreference) ?? {
    email: 0.5,
    whatsapp: 0.3,
    sms: 0.3,
    rcs: 0.1,
  };

  const results: ChannelSelection[] = [];

  for (const channel of CHANNELS) {
    // Check contact availability
    if (channel === "email" && !customer.email) {
      results.push({ channel, score: 0, reason: "No email address", allowed: false });
      continue;
    }
    if ((channel === "sms" || channel === "whatsapp" || channel === "rcs") && !customer.phone) {
      results.push({ channel, score: 0, reason: "No phone number", allowed: false });
      continue;
    }
    if (!customer.acceptsMarketing && channel !== "email") {
      results.push({ channel, score: 0, reason: "Marketing not accepted", allowed: false });
      continue;
    }

    // Check governor
    const decision = await checkAllRules({
      customerId,
      storeId,
      channel,
      messageType: "automation",
    });

    if (!decision.allowed) {
      results.push({
        channel,
        score: prefs[channel] ?? 0,
        reason: decision.reason ?? "Governor blocked",
        allowed: false,
      });
      continue;
    }

    results.push({
      channel,
      score: prefs[channel] ?? 0,
      reason: "Available",
      allowed: true,
    });
  }

  // Sort by score descending (allowed first)
  return results.sort((a, b) => {
    if (a.allowed && !b.allowed) return -1;
    if (!a.allowed && b.allowed) return 1;
    return b.score - a.score;
  });
}

/**
 * Get the best available channel, or null if all blocked.
 */
export async function getBestChannel(
  customerId: string,
  storeId: string,
): Promise<Channel | null> {
  const selections = await selectChannel(customerId, storeId);
  const best = selections.find((s) => s.allowed);
  return best?.channel ?? null;
}
