import { prisma } from "./index";

export type MarketingChannel = "email" | "sms" | "whatsapp" | "rcs";

export interface DeliveryPermission {
  allowed: boolean;
  reason?: "customer_missing" | "consent_missing" | "opted_out" | "suppressed";
  detail?: string;
}

/**
 * Resolve marketing permission at delivery time.
 *
 * Email keeps a temporary compatibility path for stores whose historical
 * Shopify consent has not yet been backfilled. All phone channels fail closed
 * unless there is explicit, channel-specific opt-in evidence.
 */
export async function getMarketingDeliveryPermission(
  customerId: string,
  channel: MarketingChannel,
  now = new Date(),
): Promise<DeliveryPermission> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      acceptsMarketing: true,
      contactConsents: {
        where: { channel },
        take: 1,
        select: { status: true, source: true },
      },
      contactSuppressions: {
        where: {
          channel,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        take: 1,
        select: { reason: true },
      },
    },
  });

  if (!customer) return { allowed: false, reason: "customer_missing" };

  const suppression = customer.contactSuppressions[0];
  if (suppression) {
    return {
      allowed: false,
      reason: "suppressed",
      detail: suppression.reason,
    };
  }

  const consent = customer.contactConsents[0];
  if (consent?.status === "opted_out") {
    return { allowed: false, reason: "opted_out", detail: consent.source };
  }
  if (consent?.status === "opted_in") return { allowed: true };

  // Compatibility for pre-migration Shopify email rows only. This can be
  // removed once every active store has completed a post-migration sync.
  if (channel === "email" && customer.acceptsMarketing) {
    return { allowed: true };
  }

  return { allowed: false, reason: "consent_missing" };
}
