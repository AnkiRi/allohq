import { prisma } from "@allohq/database";
import type { CustomerStateData, StateUpdateEvent } from "./types";
import { LifecycleStage, SupportState, VipLevel } from "./types";
import { classifyLifecycleStage } from "./lifecycle-classifier";
import { computeChannelPreference } from "./channel-preference";
import { computeFatigueState } from "./fatigue-tracker";
import { detectIntent } from "./intent-detector";
import { computeChurnRiskEstimate } from "./churn-prediction";
import { randomUUID } from "node:crypto";

export type StateTransitionCause =
  | "initial_sync"
  | "scheduled_evaluation"
  | StateUpdateEvent["type"];

const DAY_MS = 86_400_000;

export function nextCycleEvaluationAt(input: {
  lastOrderAt: Date | null;
  medianOrderIntervalDays: number | null;
  now: Date;
}): Date {
  const { lastOrderAt, medianOrderIntervalDays, now } = input;
  if (!lastOrderAt || !medianOrderIntervalDays || medianOrderIntervalDays <= 0) {
    return new Date(now.getTime() + 7 * DAY_MS);
  }
  const boundaries = [0.75, 0.95, 1.2]
    .map((ratio) => new Date(lastOrderAt.getTime() + medianOrderIntervalDays * ratio * DAY_MS))
    .filter((date) => date > now)
    .sort((a, b) => a.getTime() - b.getTime());
  return boundaries[0] ?? new Date(now.getTime() + 7 * DAY_MS);
}

/**
 * Compute full customer state from all available data sources.
 * Used on initial calculation and full recalculation events.
 */
export async function computeFullState(
  customerId: string,
  storeId: string,
  cause: StateTransitionCause = "full_recalculation"
): Promise<CustomerStateData> {
  // Fetch all required data in parallel
  const [customer, orders, rfmScore, ltv, fatigueState, channelPref, intentState, suppression] =
    await Promise.all([
      prisma.customer.findUnique({
        where: { id: customerId },
        select: { email: true, acceptsMarketing: true, store: { select: { timezone: true } } },
      }),
      prisma.order.findMany({
        where: { customerId, storeId, status: { not: "cancelled" } },
        select: { createdAt: true, totalPrice: true, totalDiscounts: true, discountCodes: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.rfmScore.findUnique({ where: { customerId } }),
      prisma.customerLifetimeValue.findUnique({ where: { customerId } }),
      computeFatigueState(customerId, storeId),
      computeChannelPreference(customerId, storeId),
      detectIntent(customerId, storeId),
      prisma.contactSuppression.findUnique({
        where: { customerId_channel: { customerId, channel: "email" } },
        select: { reason: true, expiresAt: true },
      }),
    ]);

  const now = new Date();
  const orderCount = orders.length;
  const lastOrder = orderCount > 0 ? orders[orderCount - 1]! : undefined;
  const firstOrder = orderCount > 0 ? orders[0]! : undefined;

  const daysSinceLastOrder = lastOrder
    ? (now.getTime() - lastOrder.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    : null;
  const daysSinceFirstOrder = firstOrder
    ? (now.getTime() - firstOrder.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    : null;

  // Calculate average order interval
  let avgOrderIntervalDays: number | null = null;
  let medianOrderIntervalDays: number | null = null;
  let reorderConfidence = 0;
  if (orders.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < orders.length; i++) {
      const curr = orders[i]!;
      const prev = orders[i - 1]!;
      intervals.push((curr.createdAt.getTime() - prev.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    }
    avgOrderIntervalDays = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const sorted = [...intervals].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    medianOrderIntervalDays =
      sorted.length % 2 === 0
        ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
        : (sorted[middle] ?? null);
    const variance =
      intervals.reduce((sum, value) => sum + (value - avgOrderIntervalDays!) ** 2, 0) /
      intervals.length;
    const variation = avgOrderIntervalDays > 0 ? Math.sqrt(variance) / avgOrderIntervalDays : 1;
    reorderConfidence = Math.min(
      1,
      Math.max(0, intervals.length / 5) * 0.5 + Math.max(0, 1 - variation) * 0.5
    );
  }

  const lifecycleStage = classifyLifecycleStage({
    orderCount,
    daysSinceLastOrder,
    daysSinceFirstOrder,
    avgOrderIntervalDays,
    rfmSegment: rfmScore?.segment ?? null,
    hasEmail: !!customer?.email,
  });

  const totalSpend = orders.reduce((s, o) => s + o.totalPrice, 0);
  const churnRisk = await computeChurnRiskEstimate(customerId, storeId, {
    daysSinceLastOrder,
    orderCount,
    totalSpend,
    avgOrderIntervalDays,
  });
  const discountProfile = computeDiscountProfile(orders);
  const consentState = customer?.acceptsMarketing ? "opted_in" : "opted_out";
  const activeSuppression = suppression && (!suppression.expiresAt || suppression.expiresAt > now);
  const deliveryHealth = !activeSuppression
    ? "clear"
    : suppression.reason === "complaint" || suppression.reason === "hard_bounce"
      ? suppression.reason
      : suppression.reason === "unsubscribe"
        ? "unsubscribed"
        : "suppressed";
  const nextExpectedOrderAt =
    lastOrder && medianOrderIntervalDays
      ? new Date(lastOrder.createdAt.getTime() + medianOrderIntervalDays * 86_400_000)
      : null;
  const cycleRatio =
    daysSinceLastOrder !== null && medianOrderIntervalDays
      ? daysSinceLastOrder / medianOrderIntervalDays
      : null;
  const purchaseCyclePosition: CustomerStateData["purchaseCyclePosition"] =
    cycleRatio === null
      ? "unknown"
      : cycleRatio < 0.75
        ? "early"
        : cycleRatio < 0.95
          ? "approaching"
          : cycleRatio <= 1.2
            ? "due"
            : "overdue";
  const nextEvaluationAt = nextCycleEvaluationAt({
    lastOrderAt: lastOrder?.createdAt ?? null,
    medianOrderIntervalDays,
    now,
  });
  const vipLevel = computeVipLevel(orderCount, ltv?.historicalLtv ?? 0);
  const trustScore = computeTrustScore(lifecycleStage, orderCount, churnRisk);

  // Check support state from conversations
  const supportState = await computeSupportState(customerId, storeId);

  // Campaign eligibility based on state
  const campaignEligibility = computeCampaignEligibility(
    lifecycleStage,
    customer?.acceptsMarketing ?? false,
    supportState
  );

  const stateData: CustomerStateData = {
    customerId,
    storeId,
    lifecycleStage,
    churnRisk,
    intentState,
    channelPreference: channelPref,
    optimalSendWindow: {
      timezone: customer?.store.timezone ?? "UTC",
      bestHours: [9, 10, 11, 14, 15],
    },
    communicationFatigue: fatigueState,
    discountSensitivity: discountProfile.sensitivity,
    discountBehavior: discountProfile.behavior,
    consentState,
    deliveryHealth,
    meanOrderIntervalDays: avgOrderIntervalDays,
    medianOrderIntervalDays,
    purchaseCyclePosition,
    reorderConfidence,
    nextExpectedOrderAt,
    nextEvaluationAt,
    stateEvidence: {
      orderCount,
      fullPriceOrderCount: discountProfile.fullPriceOrderCount,
      discountedOrderCount: discountProfile.discountedOrderCount,
      discountCodes: [...new Set(orders.flatMap((order) => order.discountCodes))].slice(0, 20),
      computedAt: now.toISOString(),
    },
    supportState,
    trustScore,
    vipLevel,
    campaignEligibility,
    lastStateUpdate: now,
  };

  const saved = await prisma.$transaction(async (tx) => {
    const previous = await tx.customerState.findUnique({ where: { customerId } });
    const next = await tx.customerState.upsert({
      where: { customerId },
      create: {
        customerId,
        storeId,
        lifecycleStage: stateData.lifecycleStage,
        churnRisk: stateData.churnRisk,
        intentState: stateData.intentState,
        channelPreference: stateData.channelPreference as any,
        optimalSendWindow: stateData.optimalSendWindow as any,
        communicationFatigue: stateData.communicationFatigue as any,
        discountSensitivity: stateData.discountSensitivity,
        discountBehavior: stateData.discountBehavior,
        consentState: stateData.consentState,
        deliveryHealth: stateData.deliveryHealth,
        meanOrderIntervalDays: stateData.meanOrderIntervalDays,
        medianOrderIntervalDays: stateData.medianOrderIntervalDays,
        purchaseCyclePosition: stateData.purchaseCyclePosition,
        reorderConfidence: stateData.reorderConfidence,
        nextExpectedOrderAt: stateData.nextExpectedOrderAt,
        nextEvaluationAt: stateData.nextEvaluationAt,
        stateEvidence: stateData.stateEvidence as any,
        supportState: stateData.supportState,
        trustScore: stateData.trustScore,
        vipLevel: stateData.vipLevel,
        campaignEligibility: stateData.campaignEligibility,
        lastStateUpdate: stateData.lastStateUpdate,
        stateVersion: 1,
      },
      update: {
        lifecycleStage: stateData.lifecycleStage,
        churnRisk: stateData.churnRisk,
        churnRiskUpdatedAt: now,
        intentState: stateData.intentState,
        channelPreference: stateData.channelPreference as any,
        optimalSendWindow: stateData.optimalSendWindow as any,
        communicationFatigue: stateData.communicationFatigue as any,
        discountSensitivity: stateData.discountSensitivity,
        discountBehavior: stateData.discountBehavior,
        consentState: stateData.consentState,
        deliveryHealth: stateData.deliveryHealth,
        meanOrderIntervalDays: stateData.meanOrderIntervalDays,
        medianOrderIntervalDays: stateData.medianOrderIntervalDays,
        purchaseCyclePosition: stateData.purchaseCyclePosition,
        reorderConfidence: stateData.reorderConfidence,
        nextExpectedOrderAt: stateData.nextExpectedOrderAt,
        nextEvaluationAt: stateData.nextEvaluationAt,
        stateEvidence: stateData.stateEvidence as any,
        supportState: stateData.supportState,
        trustScore: stateData.trustScore,
        vipLevel: stateData.vipLevel,
        campaignEligibility: stateData.campaignEligibility,
        lastStateUpdate: stateData.lastStateUpdate,
        evaluationClaimId: null,
        evaluationClaimedAt: null,
        evaluationFailureCount: 0,
        stateVersion: { increment: 1 },
      },
    });
    const dimensions = [
      ["lifecycle", previous?.lifecycleStage ?? null, next.lifecycleStage],
      ["purchase_cycle", previous?.purchaseCyclePosition ?? null, next.purchaseCyclePosition],
      ["discount_behavior", previous?.discountBehavior ?? null, next.discountBehavior],
      ["consent", previous?.consentState ?? null, next.consentState],
      ["delivery_health", previous?.deliveryHealth ?? null, next.deliveryHealth],
      ["intent", previous?.intentState ?? null, next.intentState],
      ["support", previous?.supportState ?? null, next.supportState],
      ["vip", previous?.vipLevel ?? null, next.vipLevel],
    ] as const;
    const transitions = dimensions
      .filter(([, fromValue, toValue]) => fromValue !== toValue)
      .map(([dimension, fromValue, toValue]) => ({
        storeId,
        customerId,
        dimension,
        fromValue,
        toValue,
        fromVersion: previous?.stateVersion ?? 0,
        toVersion: next.stateVersion,
        cause: previous ? cause : "initial_sync",
        evidence: {
          orderCount,
          medianOrderIntervalDays,
          daysSinceLastOrder: daysSinceLastOrder === null ? null : Math.round(daysSinceLastOrder),
          reorderConfidence,
        },
        nextEvaluationAt,
        occurredAt: now,
      }));
    if (transitions.length > 0) {
      await tx.customerStateTransition.createMany({ data: transitions, skipDuplicates: true });
    }
    return next;
  });

  return { ...stateData, lastStateUpdate: saved.lastStateUpdate };
}

/**
 * Incremental state update on specific events.
 * Only recalculates affected dimensions instead of full state.
 */
export async function updateStateOnEvent(event: StateUpdateEvent): Promise<void> {
  const { type, customerId, storeId } = event;

  switch (type) {
    case "order_created": {
      // Full recalculation — order affects lifecycle, churn, VIP, discount sensitivity
      await computeFullState(customerId, storeId, type);
      break;
    }

    case "email_opened":
    case "email_clicked": {
      await computeFullState(customerId, storeId, type);
      break;
    }

    case "email_sent":
    case "sms_sent":
    case "whatsapp_sent":
    case "rcs_sent": {
      await computeFullState(customerId, storeId, type);
      break;
    }

    case "support_opened":
    case "support_resolved": {
      await computeFullState(customerId, storeId, type);
      break;
    }

    case "form_submitted": {
      await computeFullState(customerId, storeId, type);
      break;
    }

    case "segment_changed":
    case "full_recalculation": {
      await computeFullState(customerId, storeId, type);
      break;
    }
  }
}

/**
 * Decay stale customer states — runs daily to prevent lifecycle stage rot.
 * Finds customers whose state hasn't been updated in 7+ days and recalculates.
 * This catches customers drifting from CHAMPION → AT_RISK → LOST without
 * any triggering event (the absence of activity IS the signal).
 */
export interface StateEvaluationDrainResult {
  claimed: number;
  updated: number;
  failed: number;
  batches: number;
  hasMore: boolean;
  oldestDueAt: Date | null;
}

async function claimDueStates(storeId: string, now: Date, batchSize: number) {
  const staleClaimBefore = new Date(now.getTime() - 30 * 60 * 1000);
  const claimId = randomUUID();
  const candidates = await prisma.customerState.findMany({
    where: {
      storeId,
      nextEvaluationAt: { lte: now },
      OR: [{ evaluationClaimedAt: null }, { evaluationClaimedAt: { lt: staleClaimBefore } }],
    },
    select: { id: true },
    orderBy: [{ nextEvaluationAt: "asc" }, { id: "asc" }],
    take: batchSize,
  });
  if (candidates.length === 0) return [];
  const ids = candidates.map((state) => state.id);
  await prisma.customerState.updateMany({
    where: {
      id: { in: ids },
      OR: [{ evaluationClaimedAt: null }, { evaluationClaimedAt: { lt: staleClaimBefore } }],
    },
    data: { evaluationClaimId: claimId, evaluationClaimedAt: now },
  });
  return prisma.customerState.findMany({
    where: { storeId, evaluationClaimId: claimId },
    select: {
      id: true,
      customerId: true,
      evaluationClaimId: true,
      evaluationFailureCount: true,
      nextEvaluationAt: true,
    },
    orderBy: [{ nextEvaluationAt: "asc" }, { id: "asc" }],
  });
}

async function runWithConcurrency<T>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<void>
) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const value = values[cursor++];
      if (value !== undefined) await task(value);
    }
  });
  await Promise.all(workers);
}

export async function drainDueStateEvaluations(
  storeId: string,
  options: { now?: Date; batchSize?: number; maxBatches?: number; concurrency?: number } = {}
): Promise<StateEvaluationDrainResult> {
  const now = options.now ?? new Date();
  const batchSize = Math.min(1_000, Math.max(25, options.batchSize ?? 250));
  const maxBatches = Math.min(100, Math.max(1, options.maxBatches ?? 8));
  const concurrency = Math.min(25, Math.max(1, options.concurrency ?? 10));
  let claimed = 0;
  let updated = 0;
  let failed = 0;
  let batches = 0;

  while (batches < maxBatches) {
    const states = await claimDueStates(storeId, now, batchSize);
    if (states.length === 0) break;
    claimed += states.length;
    batches++;
    await runWithConcurrency(states, concurrency, async (state) => {
      try {
        await computeFullState(state.customerId, storeId, "scheduled_evaluation");
        updated++;
      } catch (error) {
        failed++;
        const failureCount = state.evaluationFailureCount + 1;
        const retryHours = Math.min(24, 2 ** Math.min(failureCount, 4));
        await prisma.customerState.updateMany({
          where: { id: state.id, evaluationClaimId: state.evaluationClaimId },
          data: {
            evaluationClaimId: null,
            evaluationClaimedAt: null,
            evaluationFailureCount: { increment: 1 },
            nextEvaluationAt: new Date(now.getTime() + retryHours * 60 * 60 * 1000),
          },
        });
        console.warn(`[state-evaluation] Failed customer state recomputation`, {
          storeId,
          customerId: state.customerId,
          error: error instanceof Error ? error.message : "unknown_error",
        });
      }
    });
    if (states.length < batchSize) break;
  }

  const [nextDue, remaining] = await Promise.all([
    prisma.customerState.findFirst({
      where: { storeId, nextEvaluationAt: { lte: now } },
      select: { nextEvaluationAt: true },
      orderBy: { nextEvaluationAt: "asc" },
    }),
    prisma.customerState.count({
      where: {
        storeId,
        nextEvaluationAt: { lte: now },
        evaluationClaimedAt: null,
      },
    }),
  ]);
  return {
    claimed,
    updated,
    failed,
    batches,
    hasMore: remaining > 0,
    oldestDueAt: nextDue?.nextEvaluationAt ?? null,
  };
}

/** Compatibility wrapper for callers still using the previous daily-decay name. */
export async function decayStaleStates(storeId: string): Promise<number> {
  const result = await drainDueStateEvaluations(storeId, { maxBatches: 8 });
  return result.updated;
}

export function computeDiscountProfile(
  orders: Array<{ totalDiscounts: number; discountCodes: string[] }>
): {
  sensitivity: number;
  behavior: CustomerStateData["discountBehavior"];
  fullPriceOrderCount: number;
  discountedOrderCount: number;
} {
  if (orders.length === 0)
    return {
      sensitivity: 0.5,
      behavior: "inconclusive",
      fullPriceOrderCount: 0,
      discountedOrderCount: 0,
    };
  const discountedOrderCount = orders.filter(
    (order) => order.totalDiscounts > 0 || order.discountCodes.length > 0
  ).length;
  const fullPriceOrderCount = orders.length - discountedOrderCount;
  const ratio = discountedOrderCount / orders.length;
  const behavior =
    orders.length < 3
      ? "inconclusive"
      : ratio <= 0.2
        ? "full_price_likely"
        : ratio >= 0.8
          ? "discount_habituated"
          : ratio >= 0.5
            ? "discount_responsive"
            : "inconclusive";
  return {
    sensitivity: Math.round(ratio * 100) / 100,
    behavior,
    fullPriceOrderCount,
    discountedOrderCount,
  };
}

function computeVipLevel(orderCount: number, historicalLtv: number): VipLevel {
  if (historicalLtv >= 1000 || orderCount >= 15) return VipLevel.PLATINUM;
  if (historicalLtv >= 500 || orderCount >= 10) return VipLevel.GOLD;
  if (historicalLtv >= 200 || orderCount >= 5) return VipLevel.SILVER;
  return VipLevel.STANDARD;
}

function computeTrustScore(
  lifecycle: LifecycleStage,
  orderCount: number,
  churnRisk: number
): number {
  let score = 0.5;
  // Lifecycle bonus
  const lifecycleBonus: Record<string, number> = {
    [LifecycleStage.CHAMPION]: 0.3,
    [LifecycleStage.LOYAL]: 0.2,
    [LifecycleStage.REPEAT]: 0.1,
    [LifecycleStage.FIRST_BUYER]: 0,
    [LifecycleStage.SUBSCRIBER]: -0.1,
    [LifecycleStage.VISITOR]: -0.2,
    [LifecycleStage.AT_RISK]: -0.1,
    [LifecycleStage.LOST]: -0.2,
  };
  score += lifecycleBonus[lifecycle] ?? 0;
  // Order count bonus (diminishing)
  score += Math.min(0.2, orderCount * 0.02);
  // Churn penalty
  score -= churnRisk * 0.2;
  return Math.min(1, Math.max(0, Math.round(score * 100) / 100));
}

async function computeSupportState(customerId: string, storeId: string): Promise<SupportState> {
  const activeConversation = await prisma.conversation.findFirst({
    where: { customerId, storeId, status: "active" },
  });
  if (activeConversation) return SupportState.OPEN_ISSUE;

  // Check for recently closed conversations (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentClosed = await prisma.conversation.findFirst({
    where: {
      customerId,
      storeId,
      status: "resolved",
      updatedAt: { gte: sevenDaysAgo },
    },
  });
  if (recentClosed) return SupportState.RECENT_COMPLAINT;

  return SupportState.CLEAR;
}

function computeCampaignEligibility(
  lifecycle: LifecycleStage,
  acceptsMarketing: boolean,
  supportState: SupportState
): string[] {
  if (!acceptsMarketing) return [];
  if (supportState === SupportState.ESCALATED) return [];

  const eligibility: string[] = [];

  // All opted-in customers can receive transactional
  eligibility.push("transactional");

  if (supportState === SupportState.OPEN_ISSUE || supportState === SupportState.RECENT_COMPLAINT) {
    // Only transactional during support issues
    return eligibility;
  }

  switch (lifecycle) {
    case LifecycleStage.CHAMPION:
      eligibility.push("promotional", "vip_exclusive", "early_access", "cross_sell", "referral");
      break;
    case LifecycleStage.LOYAL:
      eligibility.push("promotional", "vip_exclusive", "cross_sell", "referral");
      break;
    case LifecycleStage.REPEAT:
      eligibility.push("promotional", "cross_sell", "loyalty_program");
      break;
    case LifecycleStage.FIRST_BUYER:
      eligibility.push("promotional", "post_purchase", "review_request");
      break;
    case LifecycleStage.SUBSCRIBER:
      eligibility.push("promotional", "welcome", "first_purchase_incentive");
      break;
    case LifecycleStage.AT_RISK:
      eligibility.push("promotional", "win_back", "special_offer");
      break;
    case LifecycleStage.LOST:
      eligibility.push("win_back");
      break;
    case LifecycleStage.VISITOR:
      break;
  }

  return eligibility;
}
