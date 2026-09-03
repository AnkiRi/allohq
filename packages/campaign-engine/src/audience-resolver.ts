import { prisma, resolveSegmentWhere } from "@allohq/database";
import { checkAllRules, loadStoreGovernorConfig } from "@allohq/communication-governor";

export const AUDIENCE_EXCLUSION_REASONS = [
  "invalid_email", "no_consent", "unsubscribed", "complaint", "hard_bounce",
  "manual_suppression", "already_processed", "fatigue", "quiet_hours",
  "collision", "cooldown", "support_state", "store_paused", "global_paused",
] as const;
export type AudienceExclusionReason = typeof AUDIENCE_EXCLUSION_REASONS[number];

export interface AudienceResolution {
  requested: number;
  eligible: Array<{ id: string; email: string; firstName: string | null; lastName: string | null }>;
  exclusions: Record<AudienceExclusionReason, number>;
  samples: Partial<Record<AudienceExclusionReason, Array<{ id: string; email: string }>>>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function suppressionReason(value: string): AudienceExclusionReason {
  if (value === "complaint") return "complaint";
  if (value === "hard_bounce") return "hard_bounce";
  if (value === "unsubscribe") return "unsubscribed";
  return "manual_suppression";
}

export function staticAudienceExclusion(input: {
  email: string;
  consentStatus?: string;
  acceptsMarketing: boolean;
  suppressionReason?: string;
  alreadyProcessed: boolean;
  storePaused: boolean;
  globalPaused: boolean;
}): AudienceExclusionReason | null {
  if (input.globalPaused) return "global_paused";
  if (input.storePaused) return "store_paused";
  if (!EMAIL.test(input.email)) return "invalid_email";
  if (input.suppressionReason) return suppressionReason(input.suppressionReason);
  if (input.consentStatus === "opted_out") return "unsubscribed";
  if (input.consentStatus !== "opted_in" && !input.acceptsMarketing) return "no_consent";
  if (input.alreadyProcessed) return "already_processed";
  return null;
}

function governorReason(rule?: string): AudienceExclusionReason {
  if (rule?.includes("quiet")) return "quiet_hours";
  if (rule?.includes("fatigue")) return "fatigue";
  if (rule?.includes("collision")) return "collision";
  if (rule?.includes("cooldown")) return "cooldown";
  return "support_state";
}

export async function resolveCampaignAudience(campaignId: string, now = new Date()): Promise<AudienceResolution> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { segment: true, store: { select: { id: true, emailSendingPausedAt: true, timezone: true } } },
  });
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  const where = campaign.segment
    ? resolveSegmentWhere(campaign.segment, [campaign.storeId])
    : { storeId: campaign.storeId };
  const [customers, processed, governorConfig] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: {
        id: true, email: true, firstName: true, lastName: true, acceptsMarketing: true,
        contactConsents: { where: { channel: "email" }, take: 1, select: { status: true } },
        contactSuppressions: {
          where: { channel: "email", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          take: 1, select: { reason: true },
        },
      },
    }),
    prisma.messageLog.findMany({ where: { campaignId }, select: { customerId: true } }),
    loadStoreGovernorConfig(campaign.storeId),
  ]);
  const already = new Set(processed.map((row) => row.customerId).filter(Boolean));
  const exclusions = Object.fromEntries(AUDIENCE_EXCLUSION_REASONS.map((reason) => [reason, 0])) as Record<AudienceExclusionReason, number>;
  const samples: AudienceResolution["samples"] = {};
  const eligible: AudienceResolution["eligible"] = [];
  const exclude = (reason: AudienceExclusionReason, customer: { id: string; email: string }) => {
    exclusions[reason]++;
    if ((samples[reason]?.length ?? 0) < 3) (samples[reason] ??= []).push({ id: customer.id, email: customer.email });
  };

  for (const customer of customers) {
    const suppression = customer.contactSuppressions[0];
    const consent = customer.contactConsents[0]?.status;
    const staticReason = staticAudienceExclusion({
      email: customer.email,
      consentStatus: consent,
      acceptsMarketing: customer.acceptsMarketing,
      suppressionReason: suppression?.reason,
      alreadyProcessed: already.has(customer.id),
      storePaused: Boolean(campaign.store.emailSendingPausedAt),
      globalPaused: process.env["GLOBAL_EMAIL_KILL_SWITCH"] === "true",
    });
    if (staticReason) { exclude(staticReason, customer); continue; }
    const decision = await checkAllRules({
      customerId: customer.id, storeId: campaign.storeId, channel: "email",
      messageType: "marketing", campaignId,
      timezone: governorConfig.timezone ?? campaign.store.timezone ?? "UTC",
      quietHours: governorConfig.quietHours,
      maxEmailsPerWeek: governorConfig.maxEmailsPerWeek,
    });
    if (!decision.allowed) { exclude(governorReason(decision.rule), customer); continue; }
    eligible.push({ id: customer.id, email: customer.email, firstName: customer.firstName, lastName: customer.lastName });
  }
  return { requested: customers.length, eligible, exclusions, samples };
}
