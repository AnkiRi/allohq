import { Worker, Queue } from "bullmq";
import {
  prisma,
  messagingCostFor,
  getMarketingDeliveryPermission,
} from "@allohq/database";
import { renderBrandedEmail, loadBrandKit, getOptimalSendTime, planCustomerDelivery } from "@allohq/customer-intelligence";
import type { EmailBlock, ProductData } from "@allohq/email-builder";
import { sendEmail } from "@allohq/messaging";
import { shopify } from "@allohq/ecommerce-integrations";
const { createDiscount, getShopifyAdminClient } = shopify;
import { DEMO_STORE_DOMAIN } from "@allohq/database";
import { checkAllRules, loadStoreGovernorConfig } from "@allohq/communication-governor";
import {
  learnFromResults,
  assignVariant as abAssignVariant,
  recordConversion,
  getActiveTestForStore,
  campaignApprovalChecksum,
  resolveCampaignAudience,
} from "@allohq/campaign-engine";
import { getRecommendations, resolveProducts } from "@allohq/product-recommendations";
import { getOrCreateExperiment, assignArm } from "@allohq/customer-state";
import { redisConnection, QUEUE_NAMES } from "../config";
import { getUnsubscribeUrl } from "../utils/unsubscribe";

const customerStateQueue = new Queue(QUEUE_NAMES.CUSTOMER_STATE, { connection: redisConnection });
// Same queue the planner runs on — used to fan out per-customer delayed delivery
// jobs and a finalize job (North Star #1: each customer sent at their own time).
const emailSendQueue = new Queue(QUEUE_NAMES.EMAIL_SEND, { connection: redisConnection });

const MAX_SEND_DELAY_MS = 12 * 60 * 60 * 1000; // cap real per-customer scheduling at 12h (matches journeys)
const DEMO_MAX_DELAY_MS = 8_000; // demo store: keep it walkable/testable (seconds, not hours)

// Per-customer decision bundle carried from the planner to the delayed delivery job.
interface DeliveryPlan {
  channel: "email"; // v1 has no channel selection or channel-learning claim
  sendHour: number;
  toneKey: string;
  greeting: string;
  emoji: string;
  signoff: string;
  reasoning: string;
}
interface SendJobData {
  campaignId: string;
}
interface DeliverOneData {
  deliverOne: true;
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
interface FinalizeData {
  finalize: true;
  campaignId: string;
}

/** ms until the next occurrence of `bestHour` (UTC), capped (demo = seconds). */
function computeDelayMs(bestHour: number, isDemo: boolean): number {
  const nowH = new Date().getUTCHours();
  let h = bestHour - nowH;
  if (h < 0) h += 24; // h === 0 → already in the optimal hour → send ~now
  const real = h * 60 * 60 * 1000;
  return Math.min(real, isDemo ? DEMO_MAX_DELAY_MS : MAX_SEND_DELAY_MS);
}

export const sendWorker = new Worker<SendJobData | DeliverOneData | FinalizeData>(
  QUEUE_NAMES.EMAIL_SEND,
  async (job) => {
    const data = job.data as SendJobData | DeliverOneData | FinalizeData;
    if ((data as DeliverOneData).deliverOne) return deliverOne(data as DeliverOneData);
    if ((data as FinalizeData).finalize) return finalizeCampaign((data as FinalizeData).campaignId, job);
    return planCampaignSend((data as SendJobData).campaignId, job);
  },
  { connection: redisConnection }
);

// ---------------------------------------------------------------------------
// PLANNER — resolves recipients, keeps the causal spine (holdout arm assignment,
// CONTROL/withheld rows, decision-time state snapshot) INTACT, decides per
// customer whether to SKIP (send-less) and their tone/channel/optimal time, and
// fans out one delayed `deliver-one` job per customer to be sent at that time.
// ---------------------------------------------------------------------------
export async function planCampaignSend(campaignId: string, job?: { updateProgress: (n: number) => Promise<void> }) {
  console.log(`Planning campaign send for ${campaignId}`);

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { template: true, segment: true, store: true },
  });
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (!campaign.template) throw new Error(`Campaign ${campaignId} has no template`);
  if (campaign.store.emailSendingPausedAt) {
    throw new Error(
      `Campaign blocked: store email delivery is paused (${campaign.store.emailSendingPauseReason ?? "manual or safety pause"})`,
    );
  }

  const currentChecksum = campaignApprovalChecksum({
    campaignId: campaign.id,
    storeId: campaign.storeId,
    name: campaign.name,
    scheduledAt: campaign.scheduledAt,
    template: {
      id: campaign.template.id,
      subject: campaign.template.subject,
      previewText: campaign.template.previewText,
      blocks: campaign.template.blocks,
      html: campaign.template.html,
    },
    segment: campaign.segment ? {
      id: campaign.segment.id,
      kind: campaign.segment.kind,
      customerIds: campaign.segment.customerIds,
      conditions: campaign.segment.conditions,
      name: campaign.segment.name,
    } : null,
    agentProposal: campaign.agentProposal,
  });
  if (!campaign.approvedAt || !campaign.approvalChecksum || campaign.approvalChecksum !== currentChecksum) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "draft", approvalChecksum: null, approvedAt: null },
    });
    throw new Error("Campaign approval is missing or stale; merchant re-approval is required");
  }

  const isDemo = campaign.store?.shopDomain === DEMO_STORE_DOMAIN;

  // Resolve the same eligibility contract shown in the merchant dry run.
  // Permission/governor checks still run again immediately before delivery,
  // because delayed jobs can outlive an unsubscribe or complaint.
  const audience = await resolveCampaignAudience(campaignId);
  const customers = await prisma.customer.findMany({
    where: { id: { in: audience.eligible.map((customer) => customer.id) } },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      rfmScore: {
        select: { segment: true, totalSpent: true, orderCount: true, avgOrderValue: true, lastOrderAt: true, recency: true, frequency: true, monetary: true, totalScore: true },
      },
      lifetimeValue: { select: { historicalLtv: true, predictedLtv: true, churnProbability: true } },
    },
  });

  const activeSubjectTest = await getActiveTestForStore(campaign.storeId, "subject_line");
  console.log(`Audience resolved for ${campaign.name}: ${audience.requested} requested, ${customers.length} eligible`, audience.exclusions);

  // Causal-data moat: get (or create) the holdout experiment for this cohort.
  const cohortLabel = campaign.segment
    ? `campaign-segment:${campaign.segmentId}`
    : `campaign-allmarketing:${campaign.storeId}`;
  const experiment = await getOrCreateExperiment(campaign.storeId, {
    label: cohortLabel,
    source: "campaign",
    campaignId,
    segmentId: campaign.segmentId ?? null,
    segmentName: campaign.segment?.name ?? null,
  });

  // North Star #2 — make the offer real before any recipient is planned. A
  // campaign must never mention a code that Shopify rejected.
  const proposal = (campaign.agentProposal ?? {}) as Record<string, any>;
  const discountPercent: number | null = typeof proposal["discountPercent"] === "number" ? proposal["discountPercent"] : null;
  const discountCode: string | null = typeof proposal["discountCode"] === "string" ? proposal["discountCode"] : null;
  let offerId: string | null = typeof proposal["offerId"] === "string" ? proposal["offerId"] : null;
  if (discountCode && !offerId && !isDemo && campaign.store?.accessToken) {
    try {
      const client = await getShopifyAdminClient(campaign.storeId);
      const endsAt = new Date();
      endsAt.setDate(endsAt.getDate() + 30);
      const res = await createDiscount(client, { code: discountCode, valueType: "percentage", value: discountPercent ?? 10, title: `Joon: ${campaign.name}`, oncePerCustomer: true, endsAt });
      offerId = String(res.priceRule.id);
      await prisma.campaign.update({ where: { id: campaignId }, data: { agentProposal: { ...proposal, offerId } } });
      console.log(`[send-worker] Created Shopify discount ${discountCode} (priceRule ${offerId}) for campaign ${campaignId}`);
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
      throw new Error(
        `Campaign blocked: Shopify could not create ${discountCode}: ${message}`,
      );
    }
  }
  const hasDiscount = !!discountCode;

  // Idempotency: never re-process anyone who already has a MessageLog for this campaign.
  const processedCustomerIds = new Set(
    (await prisma.messageLog.findMany({ where: { campaignId }, select: { customerId: true } }))
      .map((m) => m.customerId)
      .filter((id): id is string => !!id),
  );

  let scheduledCount = 0;
  let controlCount = 0;
  let skippedCount = 0;

  for (const customer of customers) {
    if (processedCustomerIds.has(customer.id)) continue;

    // Feature SNAPSHOT at DECISION time — frozen here and carried to the delayed
    // delivery so decision_records reflects the state the decision was made against.
    const rfm = customer.rfmScore;
    const ltv = customer.lifetimeValue;
    const stateSnap = {
      capturedAt: new Date().toISOString(),
      segment: rfm?.segment ?? null,
      rfm: rfm ? { recency: rfm.recency, frequency: rfm.frequency, monetary: rfm.monetary, totalScore: rfm.totalScore } : null,
      totalSpent: rfm?.totalSpent ?? null,
      orderCount: rfm?.orderCount ?? null,
      avgOrderValue: rfm?.avgOrderValue ?? null,
      lastOrderAt: rfm?.lastOrderAt ? rfm.lastOrderAt.toISOString() : null,
      historicalLtv: ltv?.historicalLtv ?? null,
      predictedLtv: ltv?.predictedLtv ?? null,
      churnProbability: ltv?.churnProbability ?? null,
    };

    // Causal-data moat: deterministic control-group assignment (UNCHANGED).
    const arm = assignArm(experiment, customer.id);
    if (arm === "CONTROL") {
      controlCount++;
      await prisma.messageLog.create({
        data: {
          workspaceId: campaign.store.workspaceId,
          storeId: campaign.storeId,
          customerId: customer.id,
          channel: "email",
          to: customer.email,
          subject: campaign.template.subject,
          campaignId,
          status: "withheld",
          treatmentArm: "CONTROL",
          experimentId: experiment.id,
          customerStateSnap: stateSnap,
          metadata: { withheld: true, reason: "control_group", experimentId: experiment.id },
        },
      });
      continue;
    }

    // --- Per-customer plan (North Star #1) ---
    const recencyDays = rfm?.lastOrderAt ? Math.floor((Date.now() - rfm.lastOrderAt.getTime()) / 86400000) : null;
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
    let bestHour = 10;
    try {
      bestHour = (await getOptimalSendTime(customer.id, campaign.storeId)).bestHour;
    } catch { /* fall back to 10:00 */ }

    // SKIP (send-less): record the decision as a "skipped" row with treatmentArm
    // NULL so it is excluded from EVERY lift reader (they all filter treatmentArm
    // IS NOT NULL) — zero change to the causal math — while still capturing the
    // held-back decision for the result page + decision-trace.
    if (decision.skip) {
      skippedCount++;
      await prisma.messageLog.create({
        data: {
          workspaceId: campaign.store.workspaceId,
          storeId: campaign.storeId,
          customerId: customer.id,
          channel: "email",
          to: customer.email,
          subject: campaign.template.subject,
          campaignId,
          status: "skipped",
          treatmentArm: null,
          experimentId: experiment.id,
          customerStateSnap: stateSnap,
          discountCode: discountCode ?? null,
          offerId,
          messageVariantId: decision.toneKey,
          messageFeatures: { channel: selectedChannel, messageType: "campaign", hasDiscount, discountPercent, segment: rfm?.segment ?? null, decision: "skip", skipReason: decision.skipReason },
          metadata: { skipped: true, skipReason: decision.skipReason, reasoning: decision.reasoning, selectedChannel, bestHour, toneKey: decision.toneKey },
        },
      });
      continue;
    }

    // A/B subject-line variant (decided at plan time, carried to delivery).
    let effectiveSubject = campaign.template.subject;
    let abTestId: string | undefined;
    let abVariant: "a" | "b" | undefined;
    if (activeSubjectTest) {
      abVariant = abAssignVariant(activeSubjectTest.id, customer.id, activeSubjectTest.splitRatio);
      abTestId = activeSubjectTest.id;
      const variantData = abVariant === "a" ? (activeSubjectTest.variantA as Record<string, unknown>) : (activeSubjectTest.variantB as Record<string, unknown>);
      if (variantData && typeof variantData["value"] === "string") effectiveSubject = variantData["value"];
    }

    // Fan out a delayed delivery job at THIS customer's optimal time.
    await emailSendQueue.add(
      "deliver-one",
      {
        deliverOne: true,
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
          toneKey: decision.toneKey,
          greeting: decision.greeting,
          emoji: decision.emoji,
          signoff: decision.signoff,
          reasoning: decision.reasoning,
        },
      } as DeliverOneData,
      {
        delay: computeDelayMs(bestHour, isDemo),
        jobId: `deliver-${campaignId}-${customer.id}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 10_000 },
      },
    );
    scheduledCount++;
  }

  // "sending" distinguishes a fully delivered campaign from delayed work.
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: "sending",
      sentAt: null,
      recipientCount: scheduledCount,
      agentProposal: {
        ...proposal,
        offerId,
        dispatch: {
          requested: audience.requested,
          eligible: audience.eligible.length,
          exclusions: audience.exclusions,
          scheduled: scheduledCount,
          control: controlCount,
          skipped: skippedCount,
          at: new Date().toISOString(),
        },
      },
    },
  });

  // Finalize (performance learning) after the last delivery window elapses.
  await emailSendQueue.add(
    "campaign-finalize",
    { finalize: true, campaignId } as FinalizeData,
    { delay: (isDemo ? DEMO_MAX_DELAY_MS : MAX_SEND_DELAY_MS) + 60_000, jobId: `finalize-${campaignId}` },
  );

  console.log(`Campaign ${campaign.name} planned: ${scheduledCount} scheduled, ${controlCount} held out (CONTROL), ${skippedCount} skipped (send-less) via experiment ${experiment.id}`);
  await job?.updateProgress(100);
  return { scheduled: scheduledCount, control: controlCount, skipped: skippedCount };
}

// ---------------------------------------------------------------------------
// DELIVER-ONE — send to a SINGLE customer at their scheduled time. Reuses the
// exact render/send/update path (A/B, dynamic products, demo-safety, fatigue,
// state) from the inline version, plus per-customer tone slotting.
// ---------------------------------------------------------------------------
export async function deliverOne(data: DeliverOneData) {
  const { campaignId, customerId, experimentId, effectiveSubject, abTestId, abVariant, discountCode, offerId, discountPercent, stateSnap, plan } = data;

  const deliveryKey = `campaign:${campaignId}:customer:${customerId}:email:treatment`;
  // Provider and database idempotency share one stable key. Failed rows are
  // intentionally reused so BullMQ can retry without generating a second send.
  const existing = await prisma.messageLog.findUnique({
    where: { deliveryKey },
    select: { id: true, status: true },
  });
  if (
    existing &&
    !["failed", "queued"].includes(existing.status)
  ) {
    return { skipped: true, reason: "already_delivered" };
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { template: true, store: true },
  });
  if (!campaign || !campaign.template) return { skipped: true, reason: "campaign_gone" };
  if (campaign.store.emailSendingPausedAt) {
    return { skipped: true, reason: "store_email_paused" };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      rfmScore: { select: { segment: true, totalSpent: true, orderCount: true, avgOrderValue: true, lastOrderAt: true } },
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
  const governorCheck = await checkAllRules({ customerId, storeId: campaign.storeId, channel: "email", messageType: "campaign", campaignId, ...govConfig });
  if (!governorCheck.allowed) {
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
      await prisma.messageLog.create({ data: {
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
      } });
    }
    return { suppressed: true };
  }

  const now = new Date();
  const variables: Record<string, string> = {
    first_name: customer.firstName ?? "there",
    last_name: customer.lastName ?? "",
    email: customer.email,
    unsubscribe_url: getUnsubscribeUrl(customerId),
    order_count: String(customer.rfmScore?.orderCount ?? 0),
    segment: customer.rfmScore?.segment ?? "New",
    ltv: `$${(customer.lifetimeValue?.historicalLtv ?? customer.rfmScore?.totalSpent ?? 0).toFixed(2)}`,
    avg_order_value: `$${(customer.rfmScore?.avgOrderValue ?? 0).toFixed(2)}`,
    last_order_date: customer.rfmScore?.lastOrderAt
      ? customer.rfmScore.lastOrderAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
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
    : await prisma.messageLog.create({ data: {
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
    } });

  // Blocks + products + brand kit for rendering.
  const blocks = campaign.template.blocks as unknown as EmailBlock[];
  const productIds: string[] = [];
  for (const block of blocks) {
    if (block.type === "product" && block.props.productId) productIds.push(block.props.productId);
    if (block.type === "product_grid") productIds.push(...block.props.productIds);
  }
  const productsMap: Record<string, ProductData> = {};
  if (productIds.length > 0) {
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    for (const p of products) {
      productsMap[p.id] = { id: p.id, title: p.title, description: p.description ?? undefined, imageUrl: p.imageUrl ?? undefined, price: p.price, compareAtPrice: p.compareAtPrice ?? undefined, handle: p.handle };
    }
  }
  const hasDynamicProducts = blocks.some(
    (b) => (b.type === "product" && b.props.source && b.props.source !== "manual") || (b.type === "product_grid" && b.props.source && b.props.source !== "manual"),
  );
  const maxDynamicCount = blocks.reduce((max, b) => (b.type === "product_grid" && b.props.dynamicProductCount ? Math.max(max, b.props.dynamicProductCount) : max), hasDynamicProducts ? 4 : 0);

  let dynamicProducts: ProductData[] | undefined;
  if (hasDynamicProducts && maxDynamicCount > 0) {
    try {
      const recs = await getRecommendations({ storeId: campaign.storeId, customerId, limit: maxDynamicCount });
      if (recs.length > 0) {
        const resolved = await resolveProducts(campaign.storeId, recs.map((r) => r.productId));
        dynamicProducts = resolved.map((r) => ({ id: r.productId, title: r.title, price: r.price, compareAtPrice: r.compareAtPrice, imageUrl: r.imageUrl, handle: r.handle }));
      }
    } catch (err: any) {
      console.warn(`[send-worker] Dynamic product resolution failed for ${customerId}: ${err.message}`);
    }
  }

  const brandKit = await loadBrandKit(campaign.storeId);
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
  const html = await renderBrandedEmail({
    storeId: campaign.storeId,
    brandKit,
    blocks,
    subject: effectiveSubject,
    variables,
    products: productsMap,
    dynamicProducts,
    previewMode: false,
    tracking: { utmSource: "allo", utmMedium: "email", utmCampaign: campaignId, utmContent: messageLog.id, storeDomain: campaign.store.shopDomain },
  });

  // Demo/sandbox safety: the seeded demo store NEVER hits a real provider.
  const result =
    campaign.store?.shopDomain === DEMO_STORE_DOMAIN
      ? ({ status: "sent", externalId: `demo-${messageLog.id}`, provider: "demo" } as any)
      : await sendEmail({
          channel: "email",
          to: customer.email,
          subject: effectiveSubject,
          html,
          from: fromAddress,
          replyTo: brandSender?.replyToEmail ?? undefined,
          headers: { "List-Unsubscribe": `<${variables.unsubscribe_url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          idempotencyKey: deliveryKey,
        });

  if (result.status === "sent") {
    await prisma.messageLog.update({ where: { id: messageLog.id }, data: { status: "sent", externalId: result.externalId, provider: result.provider ?? "resend", sentAt: new Date() } });
    if (abTestId && abVariant) {
      try { await recordConversion(abTestId, abVariant, "sent"); } catch (err: any) { console.warn(`[send-worker] A/B test recording failed: ${err.message}`); }
    }
    await prisma.customerFatigueLog.create({ data: { customerId, storeId: campaign.storeId, channel: "email", messageType: "campaign", campaignId } });
    await customerStateQueue.add("email-sent", { type: "email_sent", customerId, storeId: campaign.storeId });
    return { sent: true };
  }
  await prisma.messageLog.update({ where: { id: messageLog.id }, data: { status: "failed", provider: result.provider ?? "resend", error: result.error } });
  console.error(`  [SEND] Failed for ${customer.email}: ${result.error}`);
  throw new Error(result.error ?? "Email provider failed");
}

// ---------------------------------------------------------------------------
// FINALIZE — close the performance-learning loop once deliveries have elapsed.
// ---------------------------------------------------------------------------
async function finalizeCampaign(campaignId: string, _job: unknown) {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "sent", sentAt: new Date() },
  });
  try {
    await learnFromResults(campaignId);
  } catch (err: any) {
    console.warn(`[send-worker] Performance learning failed for ${campaignId}: ${err.message}`);
  }
  return { finalized: true };
}

sendWorker.on("completed", (job) => {
  console.log(`Send job ${job.id} completed`);
});

sendWorker.on("failed", (job, err) => {
  console.error(`Send job ${job?.id} failed:`, err.message);
});
