import { prisma, resolveSegmentWhere, type Prisma } from "@allohq/database";
import {
  checkAllRules,
  checkCampaignRulesBatch,
  loadStoreGovernorConfig,
} from "@allohq/communication-governor";
import { evaluateCampaignCandidate, type CandidateDecision } from "./candidate-policy";

export const AUDIENCE_EXCLUSION_REASONS = [
  "invalid_email",
  "no_consent",
  "unsubscribed",
  "complaint",
  "hard_bounce",
  "manual_suppression",
  "already_processed",
  "fatigue",
  "quiet_hours",
  "collision",
  "cooldown",
  "support_state",
  "recent_purchase",
  "store_paused",
  "global_paused",
] as const;
export type AudienceExclusionReason = (typeof AUDIENCE_EXCLUSION_REASONS)[number];

export interface AudienceResolution {
  requested: number;
  eligible: Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    rfmStratum: string | null;
  }>;
  exclusions: Record<AudienceExclusionReason, number>;
  samples: Partial<
    Record<
      AudienceExclusionReason,
      Array<{ id: string; email: string; firstName: string | null; lastName: string | null }>
    >
  >;
  excludedCustomers: Partial<
    Record<
      AudienceExclusionReason,
      Array<{ id: string; email: string; firstName: string | null; lastName: string | null }>
    >
  >;
  deliberatelyLeftAlone: Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    decision: CandidateDecision;
  }>;
  recentPurchaseExcluded: Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }>;
  fatigueExcluded: Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }>;
  collisionExcluded: AudienceResolution["fatigueExcluded"];
  cooldownExcluded: AudienceResolution["fatigueExcluded"];
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

export function isRecentPurchase(input: {
  lastOrderAt?: Date | null;
  hasDiscount: boolean;
  now: Date;
  standardHours?: number;
  discountHours?: number;
}): boolean {
  if (!input.lastOrderAt) return false;
  // Safety is on by default even when a store has no recent_purchase guardrail
  // row. A row customizes the windows; deleting it restores 72h / 7d defaults.
  const hours = input.hasDiscount ? (input.discountHours ?? 168) : (input.standardHours ?? 72);
  return input.lastOrderAt.getTime() >= input.now.getTime() - Math.max(0, hours) * 60 * 60 * 1000;
}

function governorReason(rule?: string): AudienceExclusionReason {
  if (rule?.includes("quiet")) return "quiet_hours";
  if (rule?.includes("fatigue")) return "fatigue";
  if (rule?.includes("collision")) return "collision";
  if (rule?.includes("cooldown")) return "cooldown";
  return "support_state";
}

export function shouldExcludeGovernorDecision(decision: {
  allowed: boolean;
  rule?: string;
}): boolean {
  return !decision.allowed && decision.rule !== "quiet_hours";
}

/** One customer's resolved decision, emitted as the audience is paged. */
export type AudienceStreamDecision =
  | { kind: "eligible"; customer: AudienceResolution["eligible"][number] }
  | {
      kind: "deliberately_left_alone";
      customer: { id: string; email: string; firstName: string | null; lastName: string | null };
      decision: CandidateDecision;
    }
  | {
      kind: "excluded";
      reason: AudienceExclusionReason;
      customer: { id: string; email: string; firstName: string | null; lastName: string | null };
    };

/** Counts and bounded samples. Never grows with the audience. */
export interface AudienceStreamSummary {
  requested: number;
  exclusions: Record<AudienceExclusionReason, number>;
  samples: AudienceResolution["samples"];
}

/**
 * Resolve a campaign audience in bounded keyset pages, emitting one decision per
 * customer instead of accumulating the whole audience.
 *
 * This is the single source of truth for campaign eligibility.
 * `resolveCampaignAudience` is a thin accumulator over it, so the rules cannot
 * drift between the streaming and materialised forms. Only counts and at most
 * three samples per reason are retained here; everything else is handed to the
 * caller and forgotten.
 *
 * Callers relying on ascending customer id (the deterministic control
 * assignment does) can: the scan is ordered by primary key.
 */
export async function streamCampaignAudience(
  campaignId: string,
  onDecision: (decision: AudienceStreamDecision) => void | Promise<void>,
  now = new Date(),
  options: { enforceDeliveryPauses?: boolean } = {}
): Promise<AudienceStreamSummary> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      segment: true,
      store: { select: { id: true, emailSendingPausedAt: true, timezone: true } },
      audienceOverridePolicies: {
        where: { active: true, mode: "all_current" },
        select: { reasonCode: true },
      },
    },
  });
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  const where = campaign.segment
    ? resolveSegmentWhere(campaign.segment, [campaign.storeId])
    : { storeId: campaign.storeId };
  const proposal = (campaign.agentProposal ?? {}) as Record<string, unknown>;
  const hasDiscount =
    typeof proposal["discountPercent"] === "number" || typeof proposal["discountCode"] === "string";
  const idSet = (key: string) =>
    new Set(
      Array.isArray(proposal[key])
        ? (proposal[key] as unknown[]).filter((value): value is string => typeof value === "string")
        : []
    );
  // Merchant override lists are bounded by what a merchant selected, not by the
  // audience, and are a locked Pass 1 capability.
  const merchantIncluded = idSet("includeLeftAloneCustomerIds");
  const recentPurchaseOverrides = idSet("overrideRecentPurchaseCustomerIds");
  const fatigueOverrides = idSet("overrideFatigueCustomerIds");
  const collisionOverrides = idSet("overrideCollisionCustomerIds");
  const cooldownOverrides = idSet("overrideCooldownCustomerIds");
  const groupOverrides = new Set(
    campaign.audienceOverridePolicies.map((policy) => policy.reasonCode)
  );
  const governorConfig = await loadStoreGovernorConfig(campaign.storeId);
  const customerSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    acceptsMarketing: true,
    rfmScore: { select: { segment: true } },
    contactConsents: { where: { channel: "email" }, take: 1, select: { status: true } },
    orders: {
      where: { status: { not: "cancelled" } },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { createdAt: true },
    },
    contactSuppressions: {
      where: { channel: "email", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      take: 1,
      select: { reason: true },
    },
    customerState: {
      select: {
        discountBehavior: true,
        purchaseCyclePosition: true,
        medianOrderIntervalDays: true,
        nextExpectedOrderAt: true,
        stateEvidence: true,
      },
    },
  } satisfies Prisma.CustomerSelect;
  const exclusions = Object.fromEntries(
    AUDIENCE_EXCLUSION_REASONS.map((reason) => [reason, 0])
  ) as Record<AudienceExclusionReason, number>;
  const samples: AudienceResolution["samples"] = {};
  const emitExcluded = async (
    reason: AudienceExclusionReason,
    customer: { id: string; email: string; firstName: string | null; lastName: string | null }
  ) => {
    exclusions[reason]++;
    const brief = {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
    };
    // At most three per reason: the campaign page shows no more than three
    // representative customers, and the full list is paged from the database.
    if ((samples[reason]?.length ?? 0) < 3) (samples[reason] ??= []).push(brief);
    await onDecision({ kind: "excluded", reason, customer: brief });
  };

  let requested = 0;
  let cursor: string | undefined;
  while (true) {
    const customers = await prisma.customer.findMany({
      where: cursor ? { AND: [where, { id: { gt: cursor } }] } : where,
      select: customerSelect,
      orderBy: { id: "asc" },
      take: 200,
    });
    if (customers.length === 0) break;
    requested += customers.length;
    cursor = customers[customers.length - 1]!.id;
    const processed = await prisma.messageLog.findMany({
      where: { campaignId, customerId: { in: customers.map((customer) => customer.id) } },
      select: { customerId: true },
    });
    const already = new Set(processed.map((row) => row.customerId).filter(Boolean));
    const governorDecisions = await checkCampaignRulesBatch(
      customers.map((customer) => customer.id),
      campaign.storeId,
      {
        now,
        timezone: governorConfig.timezone ?? campaign.store.timezone ?? "UTC",
        quietHours: governorConfig.quietHours,
        maxEmailsPerWeek: governorConfig.maxEmailsPerWeek,
      }
    );
    for (const customer of customers) {
      const suppression = customer.contactSuppressions[0];
      const consent = customer.contactConsents[0]?.status;
      const staticReason = staticAudienceExclusion({
        email: customer.email,
        consentStatus: consent,
        acceptsMarketing: customer.acceptsMarketing,
        suppressionReason: suppression?.reason,
        alreadyProcessed: already.has(customer.id),
        storePaused:
          options.enforceDeliveryPauses === false
            ? false
            : Boolean(campaign.store.emailSendingPausedAt),
        globalPaused:
          options.enforceDeliveryPauses === false
            ? false
            : process.env["GLOBAL_EMAIL_KILL_SWITCH"] === "true",
      });
      if (staticReason) {
        await emitExcluded(staticReason, customer);
        continue;
      }
      if (
        !groupOverrides.has("recent_purchase") &&
        !recentPurchaseOverrides.has(customer.id) &&
        isRecentPurchase({
          lastOrderAt: customer.orders[0]?.createdAt,
          hasDiscount,
          now,
          standardHours: governorConfig.recentPurchase?.standardHours,
          discountHours: governorConfig.recentPurchase?.discountHours,
        })
      ) {
        await emitExcluded("recent_purchase", customer);
        continue;
      }
      const candidateDecision = evaluateCampaignCandidate({
        state: customer.customerState,
        hasDiscount,
        merchantIncluded:
          groupOverrides.has("deliberately_left_alone") || merchantIncluded.has(customer.id),
      });
      if (!candidateDecision.candidate) {
        await onDecision({
          kind: "deliberately_left_alone",
          customer: {
            id: customer.id,
            email: customer.email,
            firstName: customer.firstName,
            lastName: customer.lastName,
          },
          decision: candidateDecision,
        });
        continue;
      }
      const decision = governorDecisions.get(customer.id);
      if (!decision) throw new Error(`Campaign governor decision missing for ${customer.id}`);
      // Quiet hours defer treatment delivery; they do not change eligibility or
      // the frozen randomized arm map.
      if (shouldExcludeGovernorDecision(decision)) {
        const reason = governorReason(decision.rule);
        const overridden =
          groupOverrides.has(reason) ||
          (reason === "fatigue" && fatigueOverrides.has(customer.id)) ||
          (reason === "collision" && collisionOverrides.has(customer.id)) ||
          (reason === "cooldown" && cooldownOverrides.has(customer.id));
        if (!overridden) {
          await emitExcluded(reason, customer);
          continue;
        }
      }
      await onDecision({
        kind: "eligible",
        customer: {
          id: customer.id,
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          rfmStratum: customer.rfmScore?.segment ?? null,
        },
      });
    }
  }
  return { requested, exclusions, samples };
}

/**
 * Materialised audience. Accumulates {@link streamCampaignAudience}, so the
 * eligibility rules live in exactly one place.
 *
 * This retains the whole audience by design and is for surfaces that need it —
 * the dry-run preview and the override paths, which operate on a merchant's
 * current screen. The approval and send paths must use the streaming form.
 */
export async function resolveCampaignAudience(
  campaignId: string,
  now = new Date(),
  options: { enforceDeliveryPauses?: boolean } = {}
): Promise<AudienceResolution> {
  const excludedCustomers: AudienceResolution["excludedCustomers"] = {};
  const eligible: AudienceResolution["eligible"] = [];
  const deliberatelyLeftAlone: AudienceResolution["deliberatelyLeftAlone"] = [];
  const recentPurchaseExcluded: AudienceResolution["recentPurchaseExcluded"] = [];
  const fatigueExcluded: AudienceResolution["fatigueExcluded"] = [];
  const collisionExcluded: AudienceResolution["collisionExcluded"] = [];
  const cooldownExcluded: AudienceResolution["cooldownExcluded"] = [];
  const summary = await streamCampaignAudience(
    campaignId,
    (decision) => {
      if (decision.kind === "eligible") {
        eligible.push(decision.customer);
        return;
      }
      if (decision.kind === "deliberately_left_alone") {
        deliberatelyLeftAlone.push({ ...decision.customer, decision: decision.decision });
        return;
      }
      (excludedCustomers[decision.reason] ??= []).push(decision.customer);
      if (decision.reason === "recent_purchase") recentPurchaseExcluded.push(decision.customer);
      if (decision.reason === "fatigue") fatigueExcluded.push(decision.customer);
      if (decision.reason === "collision") collisionExcluded.push(decision.customer);
      if (decision.reason === "cooldown") cooldownExcluded.push(decision.customer);
    },
    now,
    options
  );
  return {
    requested: summary.requested,
    eligible,
    exclusions: summary.exclusions,
    samples: summary.samples,
    excludedCustomers,
    deliberatelyLeftAlone,
    recentPurchaseExcluded,
    fatigueExcluded,
    collisionExcluded,
    cooldownExcluded,
  };
}

/**
 * Current sendable pool for an event-triggered journey. This is a preflight,
 * not a promise that every store customer will enter the journey: the trigger
 * still selects one customer and the runner rechecks these rules at send time.
 */
export async function resolveAutomationAudience(
  automationId: string,
  now = new Date()
): Promise<AudienceResolution> {
  const automation = await prisma.automation.findUnique({
    where: { id: automationId },
    include: { store: { select: { id: true, emailSendingPausedAt: true, timezone: true } } },
  });
  if (!automation) throw new Error(`Automation ${automationId} not found`);
  const [customers, governorConfig] = await Promise.all([
    prisma.customer.findMany({
      where: { storeId: automation.storeId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        acceptsMarketing: true,
        rfmScore: { select: { segment: true } },
        contactConsents: { where: { channel: "email" }, take: 1, select: { status: true } },
        contactSuppressions: {
          where: { channel: "email", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          take: 1,
          select: { reason: true },
        },
      },
    }),
    loadStoreGovernorConfig(automation.storeId),
  ]);
  const exclusions = Object.fromEntries(
    AUDIENCE_EXCLUSION_REASONS.map((reason) => [reason, 0])
  ) as Record<AudienceExclusionReason, number>;
  const samples: AudienceResolution["samples"] = {};
  const excludedCustomers: AudienceResolution["excludedCustomers"] = {};
  const eligible: AudienceResolution["eligible"] = [];
  const recentPurchaseExcluded: AudienceResolution["recentPurchaseExcluded"] = [];
  const fatigueExcluded: AudienceResolution["fatigueExcluded"] = [];
  const collisionExcluded: AudienceResolution["collisionExcluded"] = [];
  const cooldownExcluded: AudienceResolution["cooldownExcluded"] = [];
  const exclude = (
    reason: AudienceExclusionReason,
    customer: { id: string; email: string; firstName: string | null; lastName: string | null }
  ) => {
    exclusions[reason]++;
    (excludedCustomers[reason] ??= []).push({
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
    });
    if ((samples[reason]?.length ?? 0) < 3)
      (samples[reason] ??= []).push({
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
      });
  };
  for (const customer of customers) {
    const reason = staticAudienceExclusion({
      email: customer.email,
      consentStatus: customer.contactConsents[0]?.status,
      acceptsMarketing: customer.acceptsMarketing,
      suppressionReason: customer.contactSuppressions[0]?.reason,
      alreadyProcessed: false,
      storePaused: Boolean(automation.store.emailSendingPausedAt),
      globalPaused: process.env["GLOBAL_EMAIL_KILL_SWITCH"] === "true",
    });
    if (reason) {
      exclude(reason, customer);
      continue;
    }
    const decision = await checkAllRules({
      customerId: customer.id,
      storeId: automation.storeId,
      channel: "email",
      messageType: "automation",
      timezone: governorConfig.timezone ?? automation.store.timezone ?? "UTC",
      quietHours: governorConfig.quietHours,
      maxEmailsPerWeek: governorConfig.maxEmailsPerWeek,
      now,
    });
    if (shouldExcludeGovernorDecision(decision)) {
      const governorExclusion = governorReason(decision.rule);
      if (governorExclusion === "fatigue") {
        fatigueExcluded.push({
          id: customer.id,
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
        });
      }
      if (governorExclusion === "collision") collisionExcluded.push(customer);
      if (governorExclusion === "cooldown") cooldownExcluded.push(customer);
      exclude(governorExclusion, customer);
      continue;
    }
    eligible.push({
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      rfmStratum: customer.rfmScore?.segment ?? null,
    });
  }
  return {
    requested: customers.length,
    eligible,
    exclusions,
    samples,
    excludedCustomers,
    deliberatelyLeftAlone: [],
    recentPurchaseExcluded,
    fatigueExcluded,
    collisionExcluded,
    cooldownExcluded,
  };
}
