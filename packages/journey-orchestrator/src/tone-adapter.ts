import { prisma } from "@allohq/database";
import type { ToneStyle } from "./types";

/**
 * Determine the appropriate communication tone for a customer
 * based on their lifecycle stage and VIP level.
 */
export async function getTone(customerId: string): Promise<ToneStyle> {
  const state = await prisma.customerState.findUnique({
    where: { customerId },
    select: { lifecycleStage: true, vipLevel: true },
  });

  if (!state) return "friendly";

  // VIP customers always get exclusive tone
  if (state.vipLevel === "platinum" || state.vipLevel === "gold") {
    return "exclusive";
  }

  switch (state.lifecycleStage) {
    case "visitor":
    case "subscriber":
      return "educational";
    case "first_buyer":
      return "friendly";
    case "repeat":
      return "insider";
    case "loyal":
    case "champion":
      return "exclusive";
    case "at_risk":
      return "urgent";
    case "lost":
      return "casual";
    default:
      return "friendly";
  }
}

/**
 * Adapt content text to match the target tone.
 * Returns content with tone-specific adjustments applied.
 */
export function adaptTone(content: string, tone: ToneStyle): string {
  // Apply tone-specific prefix/suffix hints that downstream
  // AI content generation can use
  const toneMarkers: Record<ToneStyle, { prefix: string; style: string }> = {
    educational: {
      prefix: "",
      style: "helpful, informative, guiding",
    },
    friendly: {
      prefix: "",
      style: "warm, approachable, conversational",
    },
    insider: {
      prefix: "",
      style: "familiar, knowing, peer-to-peer",
    },
    exclusive: {
      prefix: "",
      style: "premium, personalised, privileged access",
    },
    urgent: {
      prefix: "",
      style: "concerned, time-sensitive, caring",
    },
    casual: {
      prefix: "",
      style: "relaxed, low-pressure, inviting",
    },
  };

  const marker = toneMarkers[tone];
  // Embed tone metadata that template renderers can extract
  return `<!--tone:${tone}|style:${marker.style}-->${content}`;
}

/**
 * Extract tone metadata from content string.
 */
export function extractToneMetadata(content: string): {
  tone: ToneStyle | null;
  style: string | null;
  cleanContent: string;
} {
  const match = content.match(/<!--tone:(\w+)\|style:([^>]+)-->/);
  if (!match) {
    return { tone: null, style: null, cleanContent: content };
  }
  return {
    tone: match[1] as ToneStyle,
    style: match[2] ?? null,
    cleanContent: content.replace(match[0], ""),
  };
}
