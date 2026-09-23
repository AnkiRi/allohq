import { Worker, Queue } from "bullmq";
import {
  prisma,
  Prisma,
  messagingCostFor,
  getMarketingDeliveryPermission,
  requireVerifiedSenderDomain,
  withSesDeliveryAttempt,
} from "@allohq/database";
import {
  renderBrandedEmail,
  loadBrandKit,
  getTimingProfiles,
  planCustomerDelivery,
  DELIVERY_WINDOWS,
  type DeliveryWindow,
} from "@allohq/customer-intelligence";
import { parseEmailDocument, safeParseEmailDocument, type EmailBlock, type ProductData } from "@allohq/email-builder";

import { sendEmail, selectedEmailProvider, sesSafeTag } from "@allohq/messaging";
import { shopify } from "@allohq/ecommerce-integrations";
const { createDiscount, getShopifyAdminClient } = shopify;
import { DEMO_STORE_DOMAIN } from "@allohq/database";
import {
  checkAllRules,
  checkQuietHours,
  loadStoreGovernorConfig,
} from "@allohq/communication-governor";
import {
  learnFromResults,
  assignVariant as abAssignVariant,
  recordConversion,
  getActiveTestForStore,
  campaignApprovalChecksum,
  streamCampaignAudience,
  campaignAudienceSnapshot,
  resolveBlockData,
  type AudienceStreamDecision,
  type CampaignPreparationRequest,
} from "@allohq/campaign-engine";
import { getRecommendations, resolveProducts } from "@allohq/product-recommendations";
import { prepareCampaignAudience, recoverStalePreparationRuns } from "./prepare-audience";
import { reconcileClosedSendingDays } from "../utils/sending-day-reconciliation";
import {
  frozenCohortSize,
  pageCohortByEngagement,
  pageFrozenCohort,
  type FrozenArm,
} from "./send-cohort";
import { redisConnection, QUEUE_NAMES } from "../config";
import { getUnsubscribeUrl } from "../utils/unsubscribe";
import { acquireEmailCapacity } from "../utils/email-capacity";
import { providerJobFailure } from "../utils/provider-job-failure";
import { nextSesWarmupDelay, nextSesWarmupResume } from "../utils/ses-warmup-defer";
import { campaignDeliveryCompletion } from "../utils/campaign-delivery-completion";
import { deliveryWindowDelay } from "../utils/delivery-window";
import { formatStoreMoney } from "../utils/format-money";

const customerStateQueue = new Queue(QUEUE_NAMES.CUSTOMER_STATE, { connection: redisConnection });
// Same queue the planner runs on — used to fan out per-customer delayed delivery
// jobs and a finalize job (North Star #1: each customer sent at their own time).
const emailSendQueue = new Queue(QUEUE_NAMES.EMAIL_SEND, { connection: redisConnection });

const DEMO_MAX_DELAY_MS = 8_000; // demo store: keep it walkable/testable (seconds, not hours)
/** Rows per statement when the planner records control and skipped recipients. */
const RECIPIENT_WRITE_CHUNK = 2_000;

/**
 * The frozen cohort: who was approved, and which arm each of them is in.
 *
 * Approval used to write both into `campaign.agentProposal` as a customerId
 * list plus an arm map — measured at 6.5 MB of JSON for a 100k campaign, parsed
 * on every dispatch and hashed whole into the approval checksum.
 * MeasurementAssignment already holds exactly this, keyed
 * (unitType, unitId, customerId), so it is read in bounded keyset pages
 * instead. Campaigns approved before that change carry the old map and fall
 * back to it, so work already in flight keeps sending.
 */
type BrandKit = Awaited<ReturnType<typeof loadBrandKit>>;

function frozenEmailDocument(campaign: {
  id: string;
  template: { subject: string; previewText: string | null; blocks: unknown } | null;
  approvedEmailVersion?: { document: unknown } | null;
}) {
  if (!campaign.template) throw new Error("Campaign has no email template");
  if (campaign.approvedEmailVersion) {
    // An approved version IS the send. If it cannot be read back, failing the
    // job is the only safe outcome — falling through to the live template
    // would deliver content the merchant never approved.
    const frozen = safeParseEmailDocument(campaign.approvedEmailVersion.document);
    if (!frozen.success) {
      throw new Error(
        `Approved email version for campaign ${campaign.id} could not be read back: ${frozen.error.issues[0]?.message ?? "invalid document"}`,
      );
    }
    return frozen.data;
  }
  return parseEmailDocument({
    schemaVersion: 1,
    envelope: {
      subject: campaign.template.subject,
      previewText: campaign.template.previewText ?? "",
      locale: "en",
    },
    blocks: campaign.template.blocks,
    metadata: {},
  });
}

function frozenBrandKit(campaign: {
  emailApproval?: { renderContext: unknown } | null;
}): BrandKit | null {
  const context = campaign.emailApproval?.renderContext;
  if (!context || typeof context !== "object" || Array.isArray(context)) return null;
  const brandKit = (context as { brandKit?: unknown }).brandKit;
  if (!brandKit || typeof brandKit !== "object" || Array.isArray(brandKit)) return null;
  return brandKit as BrandKit;
}

// Per-customer decision bundle carried from the planner to the delayed delivery job.
interface DeliveryPlan {
  channel: "email"; // v1 has no channel selection or channel-learning claim
  sendHour: number;
  deliveryWindow: DeliveryWindow;
  toneKey: string;
  greeting: string;
  emoji: string;
  signoff: string;
  reasoning: string;
  timingSource: "customer" | "store" | "default";
  timingConfidence: number;
  timezone: string;
}
interface SendJobData {
  campaignId: string;
  /** Merchant chose immediate delivery at approval instead of Joon's timing plan. */
  forceImmediate?: boolean;
}
interface DeliverOneData {
  deliverOne: true;
  /** Explicit merchant override. Consent, suppression and all non-timing safety gates still apply. */
  forceImmediate?: boolean;
  campaignId: string;
  customerId: string;
  experimentId: string;
  effectiveSubject: string;
  abTestId?: string;
  abVariant?: "a" | "b";
  discountCode: string | null;
  offerId: string | null;
  discountPercent: number | null;
  stateSnap: unknown;
  plan: DeliveryPlan;
}
interface DeliverChunkData {
  deliverChunk: true;
  campaignId: string;
  deliveries: DeliverOneData[];
}
interface FinalizeData {
  finalize: true;
  campaignId: string;
  attempt?: number;
}

async function deliverChunk(data: DeliverChunkData) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(10, data.deliveries.length) }, async () => {
    while (cursor < data.deliveries.length) {
      const delivery = data.deliveries[cursor++];
      if (delivery) await deliverOne(delivery);
    }
  });
  await Promise.all(workers);
  return { delivered: data.deliveries.length };
}

export const sendWorker = new Worker<
  | SendJobData
  | DeliverOneData
  | DeliverChunkData
  | FinalizeData
  | CampaignPreparationRequest
  | { recoverPreparation: true }
  | { reconcileSendingDays: true }
>(
  QUEUE_NAMES.EMAIL_SEND,
  async (job) => {
    const data = job.data as
      | SendJobData
      | DeliverOneData
      | DeliverChunkData
      | FinalizeData
      | CampaignPreparationRequest
      | { recoverPreparation: true }
      | { reconcileSendingDays: true };
    if ((data as { reconcileSendingDays?: boolean }).reconcileSendingDays) {
      return reconcileClosedSendingDays();
    }
    if ((data as { recoverPreparation?: boolean }).recoverPreparation) {
      return recoverStalePreparationRuns(async (request) => {
        await emailSendQueue.add("prepare-audience", request, {
          jobId: `prepare-audience-${request.campaignId}-${request.experimentId}`,
          attempts: 5,
          backoff: { type: "exponential", delay: 5_000 },
          removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
          removeOnFail: { age: 7 * 24 * 60 * 60, count: 1_000 },
        });
      });
    }
    if ((data as CampaignPreparationRequest).prepareAudience) {
      return prepareCampaignAudience(data as CampaignPreparationRequest, async (campaignId, forceImmediate) => {
        await emailSendQueue.add(
          "campaign-send",
          { campaignId, forceImmediate },
          { jobId: `campaign-send-${campaignId}` }
        );
      });
    }
    if ((data as DeliverOneData).deliverOne) return deliverOne(data as DeliverOneData);
    if ((data as DeliverChunkData).deliverChunk) return deliverChunk(data as DeliverChunkData);
    if ((data as FinalizeData).finalize)
      return finalizeCampaign((data as FinalizeData).campaignId, data as FinalizeData);
    return planCampaignSend(
      (data as SendJobData).campaignId,
      job,
      Boolean((data as SendJobData).forceImmediate)
    );
  },
  { connection: redisConnection }
);

// ---------------------------------------------------------------------------
// PLANNER — resolves recipients, keeps the causal spine (holdout arm assignment,
// CONTROL/withheld rows, decision-time state snapshot) INTACT, decides per
// customer whether to SKIP (send-less), then groups treatment recipients into
// bounded delivery-window chunks rather than creating one queue job per person.
// ---------------------------------------------------------------------------
export async function planCampaignSend(
  campaignId: string,
  job?: { updateProgress: (n: number) => Promise<void> },
  forceImmediate = false
) {
  console.log(`Planning campaign send for ${campaignId}`);

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { template: true, segment: true, store: true, approvedEmailVersion: true, emailApproval: true },
  });
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (!campaign.template) throw new Error(`Campaign ${campaignId} has no template`);
  if (!campaign.store.isActive) {
    throw new Error("Campaign blocked: store is disconnected");
  }
  const approvedEmail = frozenEmailDocument(campaign);
  if (campaign.store.emailSendingPausedAt) {
    throw new Error(
      `Campaign blocked: store email delivery is paused (${campaign.store.emailSendingPauseReason ?? "manual or safety pause"})`
    );
  }

  const currentChecksum = campaignApprovalChecksum({
    campaignId: campaign.id,
    storeId: campaign.storeId,
    name: campaign.name,
    scheduledAt: campaign.scheduledAt,
    template: {
      id: campaign.template.id,
      subject: approvedEmail.envelope.subject,
      previewText: approvedEmail.envelope.previewText,
      blocks: approvedEmail.blocks,
      html: campaign.approvedEmailVersion ? null : campaign.template.html,
    },
    segment: campaign.segment
      ? {
          id: campaign.segment.id,
          kind: campaign.segment.kind,
          customerIds: campaign.segment.customerIds,
          conditions: campaign.segment.conditions,
          name: campaign.segment.name,
        }
      : null,
    agentProposal: campaign.agentProposal,
  });
  if (
    !campaign.approvedAt ||
    !campaign.approvalChecksum ||
    campaign.approvalChecksum !== currentChecksum
  ) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "draft", approvalChecksum: null, approvedAt: null },
    });
    throw new Error("Campaign approval is missing or stale; merchant re-approval is required");
  }

  const isDemo = campaign.store?.shopDomain === DEMO_STORE_DOMAIN;

  const proposal = (campaign.agentProposal ?? {}) as Record<string, any>;
  const approvedAudience = campaignAudienceSnapshot(proposal);
  if (!approvedAudience) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "draft", approvalChecksum: null, approvedAt: null },
    });
    throw new Error(
      "Campaign audience was not frozen at approval; merchant re-approval is required"
    );
  }
  // Old approved snapshots predate provider pinning and were only dispatched
  // through Resend. Never let a provider switch reroute queued work to SES.
  if ((approvedAudience.deliveryProvider ?? "resend") !== selectedEmailProvider()) {
    throw new Error(`Campaign ${campaignId} is pinned to ${approvedAudience.deliveryProvider ?? "resend"}; current worker uses ${selectedEmailProvider()}`);
  }
  // Completeness is a count, not a cohort. The frozen rows are read one page at
  // a time inside the planning loop below.
  const frozenCohortCount = await frozenCohortSize(
    campaignId,
    approvedAudience.holdout?.assignments
  );
  if (frozenCohortCount === 0 || frozenCohortCount < approvedAudience.eligible) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "draft", approvalChecksum: null, approvedAt: null },
    });
    throw new Error(
      `Campaign cohort is incomplete: ${frozenCohortCount} frozen assignments for ${approvedAudience.eligible} approved recipients; merchant re-approval is required`
    );
  }
  const loadRecipientChunk = (ids: string[]) =>
    prisma.customer.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        rfmScore: {
          select: {
            segment: true,
            totalSpent: true,
            orderCount: true,
            avgOrderValue: true,
            lastOrderAt: true,
            recency: true,
            frequency: true,
            monetary: true,
            totalScore: true,
          },
        },
        lifetimeValue: {
          select: { historicalLtv: true, predictedLtv: true, churnProbability: true },
        },
      },
    });
  /**
   * Re-run the approval-time eligibility rules over one bounded page of the
   * frozen cohort. This is `streamCampaignAudience` itself, scoped to the
   * page's ids, so the delivery-time check cannot drift from the approval-time
   * one: consent, suppression, complaint, fatigue, collision, cooldown,
   * recent purchase and already-processed are all re-evaluated here, because a
   * delayed job can outlive any of them.
   */
  const recheckPage = async (ids: string[]) => {
    const eligible = new Set<string>();
    const summary = await streamCampaignAudience(
      campaignId,
      (decision: AudienceStreamDecision) => {
        if (decision.kind === "eligible") eligible.add(decision.customer.id);
      },
      new Date(),
      { customerIds: ids }
    );
    return { eligible, exclusions: summary.exclusions };
  };

  const activeSubjectTest = await getActiveTestForStore(campaign.storeId, "subject_line");

  // Causal-data moat: get (or create) the holdout experiment for this cohort.
  // Every campaign is a fresh randomized trial. Reusing a segment-level seed
  // would leave the same customer permanently held out across campaigns.
  const frozenHoldout = approvedAudience.holdout;
  if (!frozenHoldout) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "draft", approvalChecksum: null, approvedAt: null },
    });
    throw new Error(
      "Campaign holdout map was not frozen at approval; merchant re-approval is required"
    );
  }
  const experiment = await prisma.experiment.findFirst({
    where: { id: frozenHoldout.experimentId, storeId: campaign.storeId },
  });
  if (!experiment) throw new Error("Frozen campaign experiment no longer exists");

  // North Star #2 — make the offer real before any recipient is planned. A
  // campaign must never mention a code that Shopify rejected.
  const discountPercent: number | null =
    typeof proposal["discountPercent"] === "number" ? proposal["discountPercent"] : null;
  const discountCode: string | null =
    typeof proposal["discountCode"] === "string" ? proposal["discountCode"] : null;
  if (discountPercent != null) {
    const cap = await prisma.guardrail.findFirst({
      where: { storeId: campaign.storeId, ruleType: "max_discount", isActive: true },
      orderBy: { createdAt: "desc" },
      select: { ruleValue: true },
    });
    const maximum = (cap?.ruleValue as { maxPercent?: number } | null)?.maxPercent;
    if (typeof maximum === "number" && discountPercent > maximum) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "draft", approvalChecksum: null, approvedAt: null },
      });
      throw new Error(
        `Campaign blocked: ${discountPercent}% exceeds the current ${maximum}% discount guardrail`
      );
    }
  }
  let offerId: string | null = typeof proposal["offerId"] === "string" ? proposal["offerId"] : null;
  if (discountCode && !offerId && !isDemo && campaign.store?.accessToken) {
    try {
      const client = await getShopifyAdminClient(campaign.storeId);
      const endsAt = new Date();
      endsAt.setDate(endsAt.getDate() + 30);
      const res = await createDiscount(client, {
        code: discountCode,
        valueType: "percentage",
        value: discountPercent ?? 10,
        title: `Joon: ${campaign.name}`,
        oncePerCustomer: true,
        endsAt,
      });
      offerId = String(res.priceRule.id);
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { agentProposal: { ...proposal, offerId } },
      });
      console.log(
        `[send-worker] Created Shopify discount ${discountCode} (priceRule ${offerId}) for campaign ${campaignId}`
      );
    } catch (err: any) {
      const message = err?.message ?? String(err);
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: "draft",
          agentProposal: {
            ...proposal,
            dispatchError: {
              type: "discount_creation_failed",
              message,
              at: new Date().toISOString(),
            },
          },
        },
      });
      throw new Error(`Campaign blocked: Shopify could not create ${discountCode}: ${message}`);
    }
  }
  const hasDiscount = !!discountCode;

  // Idempotency is part of the per-page recheck: `streamCampaignAudience`
  // excludes anyone who already has a MessageLog for this campaign as
  // `already_processed`, over the page's ids rather than the whole campaign.

  let scheduledCount = 0;
  let controlCount = 0;
  let skippedCount = 0;
  let earliestDeliveryTimestamp: number | null = null;
  let latestDeliveryTimestamp: number | null = null;
  let quietHoursDeferredCount = 0;
  const timingSources: Record<DeliveryPlan["timingSource"], number> = {
    customer: 0,
    store: 0,
    default: 0,
  };
  const planningGovernorConfig = await loadStoreGovernorConfig(campaign.storeId);
  // Control and skipped recipients used to cost one round trip each, so a 100k
  // campaign performed roughly fifteen thousand sequential inserts before the
  // first email was enqueued. They are buffered and written in batches instead.
  // Neither row carries a deliveryKey, so createMany is safe here.
  const plannedLogs: Prisma.MessageLogCreateManyInput[] = [];
  const flushPlannedLogs = async (force = false) => {
    if (plannedLogs.length === 0) return;
    if (!force && plannedLogs.length < RECIPIENT_WRITE_CHUNK) return;
    const batch = plannedLogs.splice(0, plannedLogs.length);
    for (let index = 0; index < batch.length; index += RECIPIENT_WRITE_CHUNK) {
      await prisma.messageLog.createMany({
        data: batch.slice(index, index + RECIPIENT_WRITE_CHUNK),
      });
    }
  };

  let chunkIndex = 0;
  let recipientCount = 0;
  const recheckExclusions: Record<string, number> = {};
  /**
   * Enqueue one page's planned deliveries, grouped into the 15-minute buckets
   * the queue schedules on, then drop them. The planner never holds more than
   * one page of delivery payloads. A bucket that spans pages simply produces
   * more than one chunk, which the queue treats identically.
   */
  const enqueuePlannedDeliveries = async (planned: Map<number, DeliverOneData[]>) => {
    for (const [deliveryTimestamp, deliveries] of planned) {
      for (let index = 0; index < deliveries.length; index += 100) {
        await emailSendQueue.add(
          "deliver-chunk",
          {
            deliverChunk: true,
            campaignId,
            deliveries: deliveries.slice(index, index + 100),
          } as DeliverChunkData,
          {
            delay: Math.max(0, deliveryTimestamp - Date.now()),
            jobId: `deliver-chunk-${campaignId}-${chunkIndex++}`,
            attempts: 5,
            backoff: { type: "exponential", delay: 2_000 },
            removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
            removeOnFail: { age: 7 * 24 * 60 * 60, count: 10_000 },
          }
        );
      }
    }
    planned.clear();
  };

  // SES warm-up reaches the most recently engaged recipients first, which
  // Postgres orders; every other provider takes the cohort in customer-id order
  // straight from the durable assignments.
  const cohortPages = (): AsyncGenerator<FrozenArm[]> =>
    selectedEmailProvider() === "ses"
      ? pageCohortByEngagement(campaignId)
      : pageFrozenCohort(campaignId, approvedAudience.holdout?.assignments);

  for await (const cohortPage of cohortPages()) {
    const pageIds = cohortPage.map((row) => row.customerId);
    const campaignArms = new Map(cohortPage.map((row) => [row.customerId, row.arm]));
    const { eligible: stillEligible, exclusions: pageExclusions } = await recheckPage(pageIds);
    for (const [reason, count] of Object.entries(pageExclusions) as Array<[string, number]>) {
      if (count > 0) recheckExclusions[reason] = (recheckExclusions[reason] ?? 0) + count;
    }
    const customers = await loadRecipientChunk(pageIds.filter((id) => stillEligible.has(id)));
    recipientCount += customers.length;
    const timingProfiles = await getTimingProfiles(
      campaign.storeId,
      customers.map((customer) => customer.id)
    );
    const plannedDeliveries = new Map<number, DeliverOneData[]>();

    for (const customer of customers) {

      // Feature SNAPSHOT at DECISION time — frozen here and carried to the delayed
      // delivery so decision_records reflects the state the decision was made against.
      const rfm = customer.rfmScore;
      const ltv = customer.lifetimeValue;
      const stateSnap = {
        capturedAt: new Date().toISOString(),
        segment: rfm?.segment ?? null,
        rfm: rfm
          ? {
              recency: rfm.recency,
              frequency: rfm.frequency,
              monetary: rfm.monetary,
              totalScore: rfm.totalScore,
            }
          : null,
        totalSpent: rfm?.totalSpent ?? null,
        orderCount: rfm?.orderCount ?? null,
        avgOrderValue: rfm?.avgOrderValue ?? null,
        lastOrderAt: rfm?.lastOrderAt ? rfm.lastOrderAt.toISOString() : null,
        historicalLtv: ltv?.historicalLtv ?? null,
        predictedLtv: ltv?.predictedLtv ?? null,
        churnProbability: ltv?.churnProbability ?? null,
      };

      // Read the frozen arm now, but apply it only after the pre-treatment policy
      // eligibility decision below. CONTROL and TREATMENT must pass the same rule.
      const arm = campaignArms.get(customer.id) ?? "TREATMENT";

      // --- Per-customer plan (North Star #1) ---
      const recencyDays = rfm?.lastOrderAt
        ? Math.floor((Date.now() - rfm.lastOrderAt.getTime()) / 86400000)
        : null;
      const decision = planCustomerDelivery({
        segment: rfm?.segment ?? null,
        totalSpent: rfm?.totalSpent ?? null,
        orderCount: rfm?.orderCount ?? null,
        recencyDays,
        firstName: customer.firstName,
        lastName: customer.lastName,
        hasDiscount,
      });
      const selectedChannel = "email" as const;
      const timing = timingProfiles.get(customer.id);
      const deliveryWindow = timing?.window ?? "morning";
      let bestHour = DELIVERY_WINDOWS[deliveryWindow].startHour;
      let timingSource: DeliveryPlan["timingSource"] = "default";
      let timingConfidence = 0;
      let deliveryTimezone = campaign.store.timezone ?? "UTC";
      if (timing) {
        timingSource = timing.source;
        timingConfidence = timing.confidence;
        deliveryTimezone = timing.timezone;
      }

      // SKIP (send-less): record the decision as a "skipped" row with treatmentArm
      // NULL so it is excluded from EVERY lift reader (they all filter treatmentArm
      // IS NOT NULL) — zero change to the causal math — while still capturing the
      // held-back decision for the result page + decision-trace.
      if (decision.skip) {
        skippedCount++;
        plannedLogs.push({
          workspaceId: campaign.store.workspaceId,
          storeId: campaign.storeId,
          customerId: customer.id,
          channel: "email",
          to: customer.email,
          subject: approvedEmail.envelope.subject,
          campaignId,
          status: "skipped",
          treatmentArm: null,
          experimentId: experiment.id,
          customerStateSnap: stateSnap,
          discountCode: discountCode ?? null,
          offerId,
          messageVariantId: decision.toneKey,
          messageFeatures: {
            channel: selectedChannel,
            messageType: "campaign",
            hasDiscount,
            discountPercent,
            segment: rfm?.segment ?? null,
            decision: "skip",
            skipReason: decision.skipReason,
          },
          metadata: {
            skipped: true,
            skipReason: decision.skipReason,
            reasoning: decision.reasoning,
            selectedChannel,
            bestHour,
            toneKey: decision.toneKey,
          },
        });
        await flushPlannedLogs();
        continue;
      }

      // Causal-data moat: only policy-eligible customers enter the experiment.
      // The skip rule above is computed without looking at arm assignment, so the
      // measured comparison remains symmetric and randomized.
      if (arm === "CONTROL") {
        controlCount++;
        plannedLogs.push({
          workspaceId: campaign.store.workspaceId,
          storeId: campaign.storeId,
          customerId: customer.id,
          channel: "email",
          to: customer.email,
          subject: approvedEmail.envelope.subject,
          campaignId,
          status: "withheld",
          treatmentArm: "CONTROL",
          experimentId: experiment.id,
          customerStateSnap: stateSnap,
          metadata: { withheld: true, reason: "control_group", experimentId: experiment.id },
        });
        await flushPlannedLogs();
        continue;
      }

      // A/B subject-line variant (decided at plan time, carried to delivery).
      let effectiveSubject = approvedEmail.envelope.subject;
      let abTestId: string | undefined;
      let abVariant: "a" | "b" | undefined;
      if (activeSubjectTest) {
        abVariant = abAssignVariant(activeSubjectTest.id, customer.id, activeSubjectTest.splitRatio);
        abTestId = activeSubjectTest.id;
        const variantData =
          abVariant === "a"
            ? (activeSubjectTest.variantA as Record<string, unknown>)
            : (activeSubjectTest.variantB as Record<string, unknown>);
        if (variantData && typeof variantData["value"] === "string")
          effectiveSubject = variantData["value"];
      }

      // Assign this recipient to an explainable broad delivery-window cohort.
      const planningNow = new Date();
      const windowDelay = deliveryWindowDelay({
        customerId: customer.id,
        window: deliveryWindow,
        timezone: deliveryTimezone,
        now: planningNow,
        isDemo,
      });
      const windowDeliveryAt = new Date(planningNow.getTime() + windowDelay);
      const quietDecision = checkQuietHours(
        deliveryTimezone,
        planningGovernorConfig.quietHours,
        windowDeliveryAt
      );
      const deliveryDelay = forceImmediate
        ? 0
        : quietDecision.allowed
          ? windowDelay
          : isDemo
            ? DEMO_MAX_DELAY_MS
            : Math.max(0, quietDecision.delayUntil!.getTime() - planningNow.getTime());
      const deliveryAt = new Date(planningNow.getTime() + deliveryDelay);
      earliestDeliveryTimestamp =
        earliestDeliveryTimestamp == null || deliveryAt.getTime() < earliestDeliveryTimestamp
          ? deliveryAt.getTime()
          : earliestDeliveryTimestamp;
      latestDeliveryTimestamp =
        latestDeliveryTimestamp == null || deliveryAt.getTime() > latestDeliveryTimestamp
          ? deliveryAt.getTime()
          : latestDeliveryTimestamp;
      timingSources[timingSource] += 1;
      if (!quietDecision.allowed) quietHoursDeferredCount += 1;
      const deliveryData = {
        deliverOne: true,
        forceImmediate,
        campaignId,
        customerId: customer.id,
        experimentId: experiment.id,
        effectiveSubject,
        abTestId,
        abVariant,
        discountCode: discountCode ?? null,
        offerId,
        discountPercent,
        stateSnap,
        plan: {
          channel: selectedChannel,
          sendHour: bestHour,
          deliveryWindow,
          toneKey: decision.toneKey,
          greeting: decision.greeting,
          emoji: decision.emoji,
          signoff: decision.signoff,
          reasoning: decision.reasoning,
          timingSource,
          timingConfidence,
          timezone: deliveryTimezone,
        },
      } as DeliverOneData;
      const deliveryBucket = Math.floor(deliveryAt.getTime() / (15 * 60 * 1000)) * 15 * 60 * 1000;
      const bucket = plannedDeliveries.get(deliveryBucket) ?? [];
      bucket.push(deliveryData);
      plannedDeliveries.set(deliveryBucket, bucket);
      scheduledCount++;
    }

    // Control and skipped rows must be durable before this page's deliveries are
    // enqueued, so the merchant's audience reconciliation stays complete even if
    // the process dies between planning and sending.
    await flushPlannedLogs(true);
    await enqueuePlannedDeliveries(plannedDeliveries);
  }

  const hasDelayedDelivery = Boolean(
    earliestDeliveryTimestamp && earliestDeliveryTimestamp > Date.now() + 1_000
  );
  const dominantTimingSource =
    (Object.entries(timingSources) as Array<[DeliveryPlan["timingSource"], number]>).sort(
      (left, right) => right[1] - left[1]
    )[0]?.[0] ?? "default";
  const timingReason = forceImmediate
    ? "The merchant chose immediate delivery instead of Joon's recommended timing."
    : quietHoursDeferredCount > 0
      ? `${quietHoursDeferredCount} ${quietHoursDeferredCount === 1 ? "recipient is" : "recipients are"} deferred until after quiet hours.`
      : dominantTimingSource === "customer"
        ? "Joon chose times from each customer's previous email engagement."
        : dominantTimingSource === "store"
          ? "Joon chose the time when this store's customers usually engage."
          : "There is not enough engagement history yet, so Joon used the 10:00 default send time.";
  const timingConsequence = forceImmediate
    ? "Timing was overridden; consent, suppression, sender-domain and recipient allowlist checks still ran."
    : quietHoursDeferredCount > 0
      ? "Sending now may reach customers during quiet hours, which can reduce engagement and increase opt-outs."
      : dominantTimingSource === "customer"
        ? "Sending now may reduce opens because it ignores customers' observed engagement windows."
        : dominantTimingSource === "store"
          ? "Sending now may reduce opens because it ignores the store's observed engagement window."
          : "Sending now may reduce opens; this is a cautious default until Joon has enough engagement history to personalize the time.";

  // A planned delivery is scheduled, not sending. `deliverOne` moves the campaign
  // to sending only when a provider attempt actually begins.
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: hasDelayedDelivery ? "scheduled" : "sending",
      sentAt: null,
      recipientCount: scheduledCount,
      agentProposal: {
        ...proposal,
        offerId,
        dispatch: {
          requested: approvedAudience.requested,
          // Recipients that still passed every delivery-time check, and why the
          // rest did not. The approved counts stay on the audience snapshot.
          eligible: recipientCount,
          exclusions: recheckExclusions,
          scheduled: scheduledCount,
          control: controlCount,
          skipped: skippedCount,
          at: new Date().toISOString(),
          delivery: {
            earliestAt:
              earliestDeliveryTimestamp == null
                ? null
                : new Date(earliestDeliveryTimestamp).toISOString(),
            latestAt:
              latestDeliveryTimestamp == null
                ? null
                : new Date(latestDeliveryTimestamp).toISOString(),
            reason: timingReason,
            consequence: timingConsequence,
            timingSource: dominantTimingSource,
            quietHoursDeferredCount,
            merchantOverride: forceImmediate,
          },
        },
      },
    },
  });

  // Finalize (performance learning) after the last delivery window elapses.
  await emailSendQueue.add(
    "campaign-finalize",
    { finalize: true, campaignId, attempt: 0 } as FinalizeData,
    {
      delay: Math.max(0, (latestDeliveryTimestamp ?? Date.now()) - Date.now()) + 60_000,
      jobId: `finalize-${campaignId}`,
    }
  );

  console.log(
    `Campaign ${campaign.name} planned: ${scheduledCount} scheduled, ${controlCount} held out (CONTROL), ${skippedCount} skipped (send-less) via experiment ${experiment.id}`
  );
  await job?.updateProgress(100);
  return { scheduled: scheduledCount, control: controlCount, skipped: skippedCount };
}

// ---------------------------------------------------------------------------
// DELIVER-ONE — send to a SINGLE customer at their scheduled time. Reuses the
// exact render/send/update path (A/B, dynamic products, demo-safety, fatigue,
// state) from the inline version, plus per-customer tone slotting.
// ---------------------------------------------------------------------------
export async function deliverOne(data: DeliverOneData) {
  const {
    campaignId,
    customerId,
    experimentId,
    effectiveSubject,
    abTestId,
    abVariant,
    discountCode,
    offerId,
    discountPercent,
    stateSnap,
    plan,
    forceImmediate = false,
  } = data;

  const deliveryKey = `campaign:${campaignId}:customer:${customerId}:email:treatment`;
  // Provider and database idempotency share one stable key. Failed rows are
  // intentionally reused so BullMQ can retry without generating a second send.
  const existing = await prisma.messageLog.findUnique({
    where: { deliveryKey },
    select: { id: true, status: true },
  });
  if (existing && !["failed", "queued"].includes(existing.status)) {
    return { skipped: true, reason: "already_delivered" };
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { template: true, segment: true, store: true, approvedEmailVersion: true, emailApproval: true },
  });
  if (!campaign || !campaign.template) return { skipped: true, reason: "campaign_gone" };
  const approvedEmail = frozenEmailDocument(campaign);
  const approvedProvider = campaignAudienceSnapshot(campaign.agentProposal)?.deliveryProvider ?? "resend";
  if (approvedProvider !== selectedEmailProvider()) {
    throw new Error(`Campaign ${campaignId} is pinned to ${approvedProvider}; current worker uses ${selectedEmailProvider()}`);
  }
  if (!campaign.store.isActive) {
    return { skipped: true, reason: "store_disconnected" };
  }
  if (campaign.store.emailSendingPausedAt) {
    return { skipped: true, reason: "store_email_paused" };
  }
  const deliveryChecksum = campaignApprovalChecksum({
    campaignId: campaign.id,
    storeId: campaign.storeId,
    name: campaign.name,
    scheduledAt: campaign.scheduledAt,
    template: {
      id: campaign.template.id,
      subject: approvedEmail.envelope.subject,
      previewText: approvedEmail.envelope.previewText,
      blocks: approvedEmail.blocks,
      html: campaign.approvedEmailVersion ? null : campaign.template.html,
    },
    segment: campaign.segment
      ? {
          id: campaign.segment.id,
          kind: campaign.segment.kind,
          customerIds: campaign.segment.customerIds,
          conditions: campaign.segment.conditions,
          name: campaign.segment.name,
        }
      : null,
    agentProposal: campaign.agentProposal,
  });
  if (
    !campaign.approvedAt ||
    !campaign.approvalChecksum ||
    campaign.approvalChecksum !== deliveryChecksum
  ) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "draft", approvalChecksum: null, approvedAt: null },
    });
    return { skipped: true, reason: "approval_changed_before_delivery" };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      rfmScore: {
        select: {
          segment: true,
          totalSpent: true,
          orderCount: true,
          avgOrderValue: true,
          lastOrderAt: true,
        },
      },
      lifetimeValue: { select: { historicalLtv: true, churnProbability: true } },
    },
  });
  if (!customer) return { skipped: true, reason: "customer_gone" };

  const permission = await getMarketingDeliveryPermission(customerId, "email");
  if (!permission.allowed) {
    const suppressionData = {
      status: "suppressed",
      error: `Suppressed: ${permission.reason ?? "permission_denied"}${
        permission.detail ? ` (${permission.detail})` : ""
      }`,
      metadata: {
        suppressed: true,
        rule: "contact_permission",
        permission: {
          allowed: permission.allowed,
          reason: permission.reason ?? null,
          detail: permission.detail ?? null,
        },
        plan,
      } as any,
    } as const;
    if (existing) {
      await prisma.messageLog.update({
        where: { id: existing.id },
        data: suppressionData,
      });
    } else {
      await prisma.messageLog.create({
        data: {
          deliveryKey,
          workspaceId: campaign.store.workspaceId,
          storeId: campaign.storeId,
          customerId,
          channel: "email",
          to: customer.email,
          subject: effectiveSubject,
          campaignId,
          treatmentArm: "TREATMENT",
          experimentId,
          customerStateSnap: stateSnap as any,
          ...suppressionData,
        },
      });
    }
    return { suppressed: true, reason: permission.reason };
  }

  // Governor check AT SEND TIME — now honoring the merchant's OWN limits (weekly
  // cap / quiet hours / timezone) from onboarding, not store-agnostic defaults.
  const govConfig = await loadStoreGovernorConfig(campaign.storeId);
  const governorCheck = await checkAllRules({
    customerId,
    storeId: campaign.storeId,
    channel: "email",
    messageType: "campaign",
    campaignId,
    ...govConfig,
    timezone: plan.timezone ?? govConfig.timezone,
  });
  const proposal = (campaign.agentProposal ?? {}) as Record<string, unknown>;
  const fatigueOverrideIds = Array.isArray(proposal.overrideFatigueCustomerIds)
    ? proposal.overrideFatigueCustomerIds.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  const hasFatigueOverride =
    governorCheck.rule?.includes("fatigue") === true && fatigueOverrideIds.includes(customerId);
  const collisionOverrideIds = Array.isArray(proposal.overrideCollisionCustomerIds)
    ? proposal.overrideCollisionCustomerIds.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  const cooldownOverrideIds = Array.isArray(proposal.overrideCooldownCustomerIds)
    ? proposal.overrideCooldownCustomerIds.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  const hasCollisionOverride =
    governorCheck.rule?.includes("collision") === true && collisionOverrideIds.includes(customerId);
  const hasCooldownOverride =
    governorCheck.rule?.includes("cooldown") === true && cooldownOverrideIds.includes(customerId);
  const hasGovernorOverride = hasFatigueOverride || hasCollisionOverride || hasCooldownOverride;
  if (hasGovernorOverride) {
    console.log(
      `[send-worker] Audited governor override applied for campaign ${campaignId}, customer ${customerId}, rule ${governorCheck.rule}`
    );
  }
  if (!governorCheck.allowed && !hasGovernorOverride) {
    if (governorCheck.rule === "quiet_hours" && governorCheck.delayUntil) {
      if (forceImmediate) {
        console.log(
          `[send-worker] Merchant timing override bypassed quiet hours for campaign ${campaignId}, customer ${customerId}`
        );
      } else {
        const now = new Date();
        await emailSendQueue.add("deliver-one", data, {
          delay: Math.max(0, governorCheck.delayUntil.getTime() - now.getTime()),
          jobId: `deliver-${campaignId}-${customerId}-quiet-${governorCheck.delayUntil.getTime()}`,
          attempts: 5,
          backoff: { type: "exponential", delay: 2_000 },
          removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
          removeOnFail: { age: 7 * 24 * 60 * 60, count: 10_000 },
        });
        return { deferred: true, until: governorCheck.delayUntil };
      }
    } else {
      const suppressionData = {
        status: "suppressed",
        error: `Suppressed: ${governorCheck.reason}`,
        metadata: { suppressed: true, rule: governorCheck.rule, plan } as any,
      } as const;
      if (existing) {
        await prisma.messageLog.update({
          where: { id: existing.id },
          data: suppressionData,
        });
      } else {
        await prisma.messageLog.create({
          data: {
            deliveryKey,
            workspaceId: campaign.store.workspaceId,
            storeId: campaign.storeId,
            customerId,
            channel: "email",
            to: customer.email,
            subject: effectiveSubject,
            campaignId,
            treatmentArm: "TREATMENT",
            experimentId,
            customerStateSnap: stateSnap as any,
            discountCode: discountCode ?? null,
            offerId,
            messageVariantId: plan.toneKey,
            ...suppressionData,
          },
        });
      }
      return { suppressed: true };
    }
  }

  await prisma.campaign.updateMany({
    where: { id: campaignId, status: { in: ["scheduled", "sending"] } },
    data: { status: "sending" },
  });

  const now = new Date();
  const variables: Record<string, string> = {
    first_name: customer.firstName ?? "there",
    last_name: customer.lastName ?? "",
    email: customer.email,
    unsubscribe_url: getUnsubscribeUrl(customerId),
    order_count: String(customer.rfmScore?.orderCount ?? 0),
    segment: customer.rfmScore?.segment ?? "New",
    ltv: formatStoreMoney(
      customer.lifetimeValue?.historicalLtv ?? customer.rfmScore?.totalSpent ?? 0,
      campaign.store.currency
    ),
    avg_order_value: formatStoreMoney(
      customer.rfmScore?.avgOrderValue ?? 0,
      campaign.store.currency
    ),
    last_order_date: customer.rfmScore?.lastOrderAt
      ? customer.rfmScore.lastOrderAt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "N/A",
    days_since_purchase: customer.rfmScore?.lastOrderAt
      ? String(Math.floor((now.getTime() - customer.rfmScore.lastOrderAt.getTime()) / 86400000))
      : "N/A",
    discount_code: discountCode ?? "",
    // Per-customer tone slots (available to any template token that references them).
    greeting: plan.greeting,
    emoji: plan.emoji,
    signoff: plan.signoff,
  };

  const subjectLine = effectiveSubject ?? "";
  const messageFeatures = {
    channel: "email",
    selectedChannel: plan.channel,
    messageType: "campaign",
    hasDiscount: !!discountCode || /discount|off|save|%/i.test(subjectLine),
    discountPercent: discountPercent ?? null,
    subjectLineLength: subjectLine.length,
    sendHour: now.getHours(),
    optimalSendHour: plan.sendHour,
    sendDayOfWeek: now.getDay(),
    toneKey: plan.toneKey,
    segment: customer.rfmScore?.segment ?? null,
  };

  const messageLog = existing
    ? await prisma.messageLog.update({
        where: { id: existing.id },
        data: {
          status: "queued",
          error: null,
          metadata: {
            plan,
            ...(abTestId ? { abTestId, abVariant } : {}),
          } as any,
        },
      })
    : await prisma.messageLog.create({
        data: {
          deliveryKey,
          workspaceId: campaign.store.workspaceId,
          storeId: campaign.storeId,
          customerId,
          channel: "email",
          to: customer.email,
          subject: effectiveSubject,
          templateId: campaign.templateId,
          campaignId,
          status: "queued",
          treatmentArm: "TREATMENT",
          experimentId,
          customerStateSnap: stateSnap as any,
          messageFeatures,
          discountCode: discountCode ?? null,
          offerId,
          messageVariantId: plan.toneKey,
          sendCost: messagingCostFor("email"),
          metadata: { plan, ...(abTestId ? { abTestId, abVariant } : {}) } as any,
        },
      });

  // Blocks + products + brand kit for rendering.
  const blocks = approvedEmail.blocks as EmailBlock[];
  const productIds: string[] = [];
  for (const block of blocks) {
    if (block.type === "product" && block.props.productId) productIds.push(block.props.productId);
    if (block.type === "product_grid") productIds.push(...block.props.productIds);
  }
  // Same resolver the Studio preview and the approval snapshot use, so what a
  // merchant approved is what gets rendered here — including the contents of a
  // bound collection, which is live by design and must not be read twice in
  // two different ways.
  const { products: productsMap, collections: collectionsMap } = await resolveBlockData(
    prisma as never,
    blocks,
    campaign.storeId,
  );
  void productIds;
  const hasDynamicProducts = blocks.some(
    (b) =>
      (b.type === "product" && b.props.source && b.props.source !== "manual") ||
      (b.type === "product_grid" && b.props.source && b.props.source !== "manual")
  );
  const maxDynamicCount = blocks.reduce(
    (max, b) =>
      b.type === "product_grid" && b.props.dynamicProductCount
        ? Math.max(max, b.props.dynamicProductCount)
        : max,
    hasDynamicProducts ? 4 : 0
  );

  let dynamicProducts: ProductData[] | undefined;
  if (hasDynamicProducts && maxDynamicCount > 0) {
    try {
      const recs = await getRecommendations({
        storeId: campaign.storeId,
        customerId,
        limit: maxDynamicCount,
      });
      if (recs.length > 0) {
        const resolved = await resolveProducts(
          campaign.storeId,
          recs.map((r) => r.productId)
        );
        dynamicProducts = resolved.map((r) => ({
          id: r.productId,
          title: r.title,
          price: r.price,
          compareAtPrice: r.compareAtPrice,
          imageUrl: r.imageUrl,
          handle: r.handle,
        }));
      }
    } catch (err: any) {
      console.warn(
        `[send-worker] Dynamic product resolution failed for ${customerId}: ${err.message}`
      );
    }
  }

  const brandKit = frozenBrandKit(campaign) ?? await loadBrandKit(campaign.storeId);
  // Sender identity (Phase 5): send from the brand's own from-name/email + reply-to
  // when set, instead of the hardcoded noreply@allohq.com (a deliverability + brand fix).
  const brandSender = await prisma.brandProfile.findFirst({
    where: { storeId: campaign.storeId },
    select: { fromName: true, fromEmail: true, replyToEmail: true },
  });
  const fromAddress =
    brandSender?.fromName && brandSender?.fromEmail
      ? `${brandSender.fromName} <${brandSender.fromEmail}>`
      : brandSender?.fromEmail || process.env["RESEND_FROM_EMAIL"] || "noreply@allohq.com";
  await requireVerifiedSenderDomain(campaign.storeId, fromAddress);
  const html = await renderBrandedEmail({
    storeId: campaign.storeId,
    brandKit,
    blocks,
    subject: effectiveSubject,
    previewText: approvedEmail.envelope.previewText || undefined,
    variables,
    products: productsMap,
    dynamicProducts,
    collections: collectionsMap,
    previewMode: false,
    tracking: {
      utmSource: "allo",
      utmMedium: "email",
      utmCampaign: campaignId,
      utmContent: messageLog.id,
      storeDomain: campaign.store.shopDomain,
    },
  });

  // Demo/sandbox safety: the seeded demo store NEVER hits a real provider.
  const usingSes =
    selectedEmailProvider() === "ses" && campaign.store?.shopDomain !== DEMO_STORE_DOMAIN;
  const capacity =
    campaign.store?.shopDomain === DEMO_STORE_DOMAIN || usingSes
      ? null
      : await acquireEmailCapacity(campaign.storeId, campaign.store.installedAt);
  if (capacity && !capacity.allowed) {
    await prisma.messageLog.update({
      where: { id: messageLog.id },
      data: { status: "queued", error: `Deferred: ${capacity.reason}` },
    });
    if (capacity.reason === "daily_cap") {
      const nextDay = nextSesWarmupResume();
      await emailSendQueue.add(
        "deliver-one",
        {
          deliverOne: true,
          campaignId,
          customerId,
          experimentId,
          abTestId,
          abVariant,
          discountCode,
          offerId,
          discountPercent,
          stateSnap,
          plan,
        },
        {
          jobId: `${deliveryKey}-warmup-${nextDay.toISOString().slice(0, 10)}`,
          delay: nextSesWarmupDelay(),
        }
      );
      return { sent: false, deferred: true };
    }
    throw new Error(`Email capacity unavailable: ${capacity.reason}`);
  }
  let result;
  try {
    result =
      campaign.store?.shopDomain === DEMO_STORE_DOMAIN
        ? ({ status: "sent", externalId: `demo-${messageLog.id}`, provider: "demo" } as any)
        : await withSesDeliveryAttempt(
            prisma,
            {
              enabled: usingSes,
              deliveryKey,
              storeId: campaign.storeId,
              providerTag: sesSafeTag(deliveryKey),
              acquireSubmissionLease: usingSes
                ? async () => {
                    const lease = await acquireEmailCapacity(
                      campaign.storeId,
                      campaign.store.installedAt
                    );
                    if (!lease.allowed) {
                      await prisma.messageLog.update({
                        where: { id: messageLog.id },
                        data: { status: "queued", error: `Deferred: ${lease.reason}` },
                      });
                      if (lease.reason === "daily_cap") {
                        const nextDay = nextSesWarmupResume();
                        await emailSendQueue.add(
                          "deliver-one",
                          {
                            deliverOne: true,
                            campaignId,
                            customerId,
                            experimentId,
                            abTestId,
                            abVariant,
                            discountCode,
                            offerId,
                            discountPercent,
                            stateSnap,
                            plan,
                          },
                          {
                            jobId: `${deliveryKey}-warmup-${nextDay.toISOString().slice(0, 10)}`,
                            delay: nextSesWarmupDelay(),
                          }
                        );
                      }
                      throw new Error(`Email capacity unavailable: ${lease.reason}`);
                    }
                    return lease;
                  }
                : undefined,
            },
            () =>
              sendEmail({
                channel: "email",
                to: customer.email,
                subject: effectiveSubject,
                html,
                from: fromAddress,
                replyTo: brandSender?.replyToEmail ?? undefined,
                headers: {
                  "List-Unsubscribe": `<${variables.unsubscribe_url}>`,
                  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                },
                idempotencyKey: deliveryKey,
                storeId: campaign.storeId,
                campaignId,
                emailStream: "broadcast",
              })
          );
  } finally {
    await capacity?.release();
  }

  if (result.status === "sent") {
    await prisma.messageLog.update({
      where: { id: messageLog.id },
      data: {
        status: "sent",
        externalId: result.externalId,
        provider: result.provider ?? "resend",
        sentAt: new Date(),
      },
    });
    if (abTestId && abVariant) {
      try {
        await recordConversion(abTestId, abVariant, "sent");
      } catch (err: any) {
        console.warn(`[send-worker] A/B test recording failed: ${err.message}`);
      }
    }
    await prisma.customerFatigueLog.create({
      data: {
        customerId,
        storeId: campaign.storeId,
        channel: "email",
        messageType: "campaign",
        campaignId,
      },
    });
    await customerStateQueue.add("email-sent", {
      type: "email_sent",
      customerId,
      storeId: campaign.storeId,
    });
    return { sent: true };
  }
  await prisma.messageLog.update({
    where: { id: messageLog.id },
    data: { status: "failed", provider: result.provider ?? "resend", error: result.error },
  });
  console.error(`  [SEND] Failed for customer ${customer.id}: ${result.error}`);
  throw providerJobFailure(result);
}

// ---------------------------------------------------------------------------
// FINALIZE — close the performance-learning loop once deliveries have elapsed.
// ---------------------------------------------------------------------------
async function finalizeCampaign(campaignId: string, data: FinalizeData) {
  const attempt = data.attempt ?? 0;
  const pendingJobs = (
    await emailSendQueue.getJobs(["delayed", "waiting", "active"], 0, 10_000)
  ).filter(
    (candidate) =>
      (candidate.name === "deliver-one" || candidate.name === "deliver-chunk") &&
      (candidate.data as { campaignId?: unknown } | null)?.campaignId === campaignId
  );
  if (pendingJobs.length > 0) {
    await emailSendQueue.add(
      "campaign-finalize",
      { finalize: true, campaignId, attempt: attempt + 1 } as FinalizeData,
      {
        delay: 60_000,
        jobId: `finalize-${campaignId}-check-${attempt + 1}`,
        removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
      }
    );
    return { finalized: false, pending: pendingJobs.length };
  }

  const [campaign, statusRows] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId }, select: { agentProposal: true } }),
    prisma.messageLog.groupBy({
      by: ["status"],
      where: { campaignId, treatmentArm: "TREATMENT" },
      _count: true,
    }),
  ]);
  if (!campaign) return { finalized: false, reason: "campaign_gone" };
  const counts = Object.fromEntries(statusRows.map((row) => [row.status, row._count]));
  const proposal = (campaign.agentProposal ?? {}) as Record<string, any>;
  const dispatch = (proposal["dispatch"] ?? {}) as Record<string, any>;
  const logged = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const planned = Number(dispatch["scheduled"] ?? logged);
  const { accepted, failed, suppressed, completed, status } = campaignDeliveryCompletion(
    planned,
    counts
  );

  // Do not manufacture completion while logs are still catching up with jobs.
  if (completed < planned) {
    await emailSendQueue.add(
      "campaign-finalize",
      { finalize: true, campaignId, attempt: attempt + 1 } as FinalizeData,
      { delay: 60_000, jobId: `finalize-${campaignId}-logs-${attempt + 1}` }
    );
    return { finalized: false, pendingLogs: planned - completed };
  }

  if (!status) return { finalized: false, pendingLogs: planned - completed };
  const completedAt = new Date();
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status,
      sentAt: accepted > 0 ? completedAt : null,
      agentProposal: {
        ...proposal,
        dispatch: {
          ...dispatch,
          completion: {
            planned,
            accepted,
            failed,
            suppressed,
            completedAt: completedAt.toISOString(),
          },
        },
      },
    },
  });
  try {
    await learnFromResults(campaignId);
  } catch (err: any) {
    console.warn(`[send-worker] Performance learning failed for ${campaignId}: ${err.message}`);
  }
  return { finalized: true, status, planned, accepted, failed, suppressed };
}

sendWorker.on("completed", (job) => {
  console.log(`Send job ${job.id} completed`);
});

sendWorker.on("failed", (job, err) => {
  console.error(`Send job ${job?.id} failed:`, err.message);
});
