import { prisma } from "@allohq/database";
import { latestRedeemedOffer } from "./cooldown-manager";
import { checkQuietHours } from "./quiet-hours";
import { DEFAULT_FATIGUE_CONFIG, type GovernorDecision } from "./types";

type MessageFact = {
  campaignId: string | null;
  channel: string;
  status: string;
  sentAt: Date | null;
  metadata: unknown;
};

export interface CampaignGovernorFacts {
  supportState: string | null;
  activeSupport: boolean;
  resolvedSupportAt: Date | null;
  fatigue: Array<{ channel: string; sentAt: Date }>;
  messages: MessageFact[];
  orders: Array<{ createdAt: Date; discountCodes: string[] }>;
}

export interface CampaignGovernorPolicy {
  now: Date;
  timezone: string;
  quietHours?: { startHour: number; endHour: number };
  maxEmailsPerWeek?: number;
}

/** Same safety order as checkAllRules, evaluated from a bounded fact batch. */
export function evaluateCampaignGovernorFacts(
  facts: CampaignGovernorFacts,
  policy: CampaignGovernorPolicy
): GovernorDecision {
  const { now } = policy;
  if (
    ["open_issue", "escalated", "recent_complaint"].includes(facts.supportState ?? "") ||
    (!facts.supportState && facts.activeSupport)
  ) {
    return {
      allowed: false,
      rule: facts.supportState ? `support_${facts.supportState}` : "support_active_conversation",
    };
  }

  const weekStart = now.getTime() - 7 * 86_400_000;
  const monthStart = now.getTime() - 30 * 86_400_000;
  const emailLogs = facts.fatigue.filter((row) => row.channel === "email");
  const weekCount = emailLogs.filter((row) => row.sentAt.getTime() >= weekStart).length;
  const monthCount = emailLogs.filter((row) => row.sentAt.getTime() >= monthStart).length;
  if (weekCount >= (policy.maxEmailsPerWeek ?? DEFAULT_FATIGUE_CONFIG.email.weeklyMax))
    return { allowed: false, rule: "fatigue_weekly" };
  if (monthCount >= DEFAULT_FATIGUE_CONFIG.email.monthlyMax)
    return { allowed: false, rule: "fatigue_monthly" };

  const collisionStart = now.getTime() - 48 * 3_600_000;
  if (
    facts.messages.some(
      (row) =>
        row.campaignId &&
        row.sentAt &&
        row.sentAt.getTime() >= collisionStart &&
        ["sent", "delivered", "opened", "clicked"].includes(row.status)
    )
  )
    return { allowed: false, rule: "collision_48h" };
  const channelStart = now.getTime() - 2 * 3_600_000;
  if (facts.fatigue.some((row) => row.channel !== "email" && row.sentAt.getTime() >= channelStart))
    return { allowed: false, rule: "channel_arbitration" };

  const discountStart = now.getTime() - 14 * 86_400_000;
  const offers = facts.messages
    .filter(
      (row) =>
        row.sentAt &&
        row.sentAt.getTime() >= discountStart &&
        (row.metadata as Record<string, unknown> | null)?.hasDiscount === true
    )
    .sort((a, b) => b.sentAt!.getTime() - a.sentAt!.getTime())
    .slice(0, 20)
    .flatMap((row) => {
      const code = (row.metadata as Record<string, unknown> | null)?.discountCode;
      return row.sentAt && typeof code === "string" && code.trim()
        ? [{ sentAt: row.sentAt, discountCode: code.trim().toUpperCase() }]
        : [];
    });
  const redeemed = latestRedeemedOffer(offers, facts.orders);
  if (redeemed && now.getTime() - redeemed.sentAt.getTime() < 14 * 86_400_000)
    return { allowed: false, rule: "cooldown_post_discount" };
  if (facts.resolvedSupportAt && now.getTime() - facts.resolvedSupportAt.getTime() < 7 * 86_400_000)
    return { allowed: false, rule: "cooldown_post_complaint" };
  return checkQuietHours(policy.timezone, policy.quietHours, now);
}

/** Read governor facts in bounded groups, not one database round-trip per customer. */
export async function checkCampaignRulesBatch(
  customerIds: readonly string[],
  storeId: string,
  policy: CampaignGovernorPolicy
): Promise<Map<string, GovernorDecision>> {
  const decisions = new Map<string, GovernorDecision>();
  const monthStart = new Date(policy.now.getTime() - 30 * 86_400_000);
  const discountStart = new Date(policy.now.getTime() - 14 * 86_400_000);
  const weekStart = new Date(policy.now.getTime() - 7 * 86_400_000);
  for (let start = 0; start < customerIds.length; start += 200) {
    const ids = [...customerIds.slice(start, start + 200)];
    const [states, conversations, fatigue, messages, orders] = await Promise.all([
      prisma.customerState.findMany({
        where: { customerId: { in: ids } },
        select: { customerId: true, supportState: true },
      }),
      prisma.conversation.findMany({
        where: {
          storeId,
          customerId: { in: ids },
          OR: [{ status: "active" }, { status: "resolved", updatedAt: { gte: weekStart } }],
        },
        select: { customerId: true, status: true, updatedAt: true },
      }),
      prisma.customerFatigueLog.findMany({
        where: { storeId, customerId: { in: ids }, sentAt: { gte: monthStart } },
        select: { customerId: true, channel: true, sentAt: true },
      }),
      prisma.messageLog.findMany({
        where: { storeId, customerId: { in: ids }, sentAt: { gte: discountStart } },
        select: {
          customerId: true,
          campaignId: true,
          channel: true,
          status: true,
          sentAt: true,
          metadata: true,
        },
      }),
      prisma.order.findMany({
        where: {
          storeId,
          customerId: { in: ids },
          status: { not: "cancelled" },
          createdAt: { gte: discountStart },
        },
        select: { customerId: true, createdAt: true, discountCodes: true },
      }),
    ]);
    for (const id of ids) {
      const state = states.find((row) => row.customerId === id);
      const support = conversations.filter((row) => row.customerId === id);
      decisions.set(
        id,
        evaluateCampaignGovernorFacts(
          {
            supportState: state?.supportState ?? null,
            activeSupport: !state && support.some((row) => row.status === "active"),
            resolvedSupportAt: support
              .filter((row) => row.status === "resolved")
              .reduce<Date | null>(
                (latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest),
                null
              ),
            fatigue: fatigue.filter((row) => row.customerId === id),
            messages: messages.filter((row) => row.customerId === id),
            orders: orders.filter((row) => row.customerId === id),
          },
          policy
        )
      );
    }
  }
  return decisions;
}
