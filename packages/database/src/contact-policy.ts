import { prisma } from "./index";

export type MarketingChannel = "email" | "sms" | "whatsapp" | "rcs";

export interface DeliveryPermission {
  allowed: boolean;
  reason?: "customer_missing" | "consent_missing" | "opted_out" | "suppressed";
  detail?: string;
}

export function marketingPermissionFromState(input: {
  customerExists: boolean;
  channel: MarketingChannel;
  acceptsMarketing: boolean;
  consent?: { status: string; source: string };
  suppressionReason?: string;
}): DeliveryPermission {
  if (!input.customerExists) return { allowed: false, reason: "customer_missing" };
  if (input.suppressionReason) return { allowed: false, reason: "suppressed", detail: input.suppressionReason };
  if (input.consent?.status === "opted_out") return { allowed: false, reason: "opted_out", detail: input.consent.source };
  if (input.consent?.status === "opted_in") return { allowed: true };
  if (input.channel === "email" && input.acceptsMarketing) return { allowed: true };
  return { allowed: false, reason: "consent_missing" };
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

  return marketingPermissionFromState({
    customerExists: Boolean(customer),
    channel,
    acceptsMarketing: customer?.acceptsMarketing ?? false,
    consent: customer?.contactConsents[0],
    suppressionReason: customer?.contactSuppressions[0]?.reason,
  });
}
