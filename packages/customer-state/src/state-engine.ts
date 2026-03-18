import { prisma } from "@allohq/database";
import type { CustomerStateData, StateUpdateEvent } from "./types";
import { LifecycleStage, SupportState, VipLevel } from "./types";
import { classifyLifecycleStage } from "./lifecycle-classifier";
import { computeChannelPreference } from "./channel-preference";
import { computeFatigueState } from "./fatigue-tracker";
import { detectIntent } from "./intent-detector";
import { computeChurnProbability } from "./churn-prediction";

/**
 * Compute full customer state from all available data sources.
 * Used on initial calculation and full recalculation events.
 */
export async function computeFullState(
  customerId: string,
  storeId: string,
): Promise<CustomerStateData> {
  // Fetch all required data in parallel
  const [customer, orders, rfmScore, ltv, fatigueState, channelPref, intentState] =
    await Promise.all([
      prisma.customer.findUnique({
        where: { id: customerId },
        select: { email: true, acceptsMarketing: true },
      }),
      prisma.order.findMany({
        where: { customerId, storeId, status: { not: "cancelled" } },
        select: { createdAt: true, totalPrice: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.rfmScore.findUnique({ where: { customerId } }),
      prisma.customerLifetimeValue.findUnique({ where: { customerId } }),
      computeFatigueState(customerId, storeId),
      computeChannelPreference(customerId, storeId),
      detectIntent(customerId, storeId),
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
  if (orders.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < orders.length; i++) {
      const curr = orders[i]!;
      const prev = orders[i - 1]!;
      intervals.push(
        (curr.createdAt.getTime() - prev.createdAt.getTime()) /
          (1000 * 60 * 60 * 24),
      );
    }
    avgOrderIntervalDays = intervals.reduce((a, b) => a + b, 0) / intervals.length;
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
  const churnRisk = await computeChurnProbability(customerId, storeId, {
    daysSinceLastOrder,
    orderCount,
    totalSpend,
    avgOrderIntervalDays,
  });
  const discountSensitivity = computeDiscountSensitivity(orders);
  const vipLevel = computeVipLevel(orderCount, ltv?.historicalLtv ?? 0);
  const trustScore = computeTrustScore(lifecycleStage, orderCount, churnRisk);

  // Check support state from conversations
  const supportState = await computeSupportState(customerId, storeId);

  // Campaign eligibility based on state
  const campaignEligibility = computeCampaignEligibility(
    lifecycleStage,
    customer?.acceptsMarketing ?? false,
    supportState,
  );

  const stateData: CustomerStateData = {
    customerId,
    storeId,
    lifecycleStage,
    churnRisk,
    intentState,
    channelPreference: channelPref,
    optimalSendWindow: { timezone: "UTC", bestHours: [9, 10, 11, 14, 15] },
    communicationFatigue: fatigueState,
    discountSensitivity,
    supportState,
    trustScore,
    vipLevel,
    campaignEligibility,
    lastStateUpdate: now,
  };

  // Upsert into database
  await prisma.customerState.upsert({
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
      supportState: stateData.supportState,
      trustScore: stateData.trustScore,
      vipLevel: stateData.vipLevel,
      campaignEligibility: stateData.campaignEligibility,
      lastStateUpdate: stateData.lastStateUpdate,
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
      supportState: stateData.supportState,
      trustScore: stateData.trustScore,
      vipLevel: stateData.vipLevel,
      campaignEligibility: stateData.campaignEligibility,
      lastStateUpdate: stateData.lastStateUpdate,
    },
  });

  return stateData;
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
      await computeFullState(customerId, storeId);
      break;
    }

    case "email_opened":
    case "email_clicked": {
      const [channelPref, intentState] = await Promise.all([
        computeChannelPreference(customerId, storeId),
        detectIntent(customerId, storeId),
      ]);
      await prisma.customerState.update({
        where: { customerId },
        data: {
          channelPreference: channelPref as any,
          intentState,
          lastStateUpdate: new Date(),
        },
      });
      break;
    }

    case "email_sent":
    case "sms_sent":
    case "whatsapp_sent":
    case "rcs_sent": {
      const fatigue = await computeFatigueState(customerId, storeId);
      await prisma.customerState.update({
        where: { customerId },
        data: {
          communicationFatigue: fatigue as any,
          lastStateUpdate: new Date(),
        },
      });
      break;
    }

    case "support_opened":
    case "support_resolved": {
      const supportState = await computeSupportState(customerId, storeId);
      const eligibility = computeCampaignEligibility(
        LifecycleStage.REPEAT, // will be overridden by actual state
        true,
        supportState,
      );
      await prisma.customerState.update({
        where: { customerId },
        data: {
          supportState,
          campaignEligibility: eligibility,
          lastStateUpdate: new Date(),
        },
      });
      break;
    }

    case "form_submitted": {
      // Update channel preferences based on consent from form submission
      const consent = event.data?.["consent"] as { email?: boolean; sms?: boolean; whatsapp?: boolean } | undefined;
      if (consent) {
        const existing = await prisma.customerState.findUnique({
          where: { customerId },
          select: { channelPreference: true },
        });
        const currentPref = (existing?.channelPreference as unknown as Record<string, number>) ?? {};
        // Boost channels the customer consented to
        if (consent.email) currentPref["email"] = Math.min((currentPref["email"] ?? 0.5) + 0.2, 1);
        if (consent.sms) currentPref["sms"] = Math.min((currentPref["sms"] ?? 0.3) + 0.3, 1);
        if (consent.whatsapp) currentPref["whatsapp"] = Math.min((currentPref["whatsapp"] ?? 0.3) + 0.3, 1);
        await prisma.customerState.update({
          where: { customerId },
          data: {
            channelPreference: currentPref as any,
            lastStateUpdate: new Date(),
          },
        });
      }
      break;
    }

    case "segment_changed":
    case "full_recalculation": {
      await computeFullState(customerId, storeId);
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
export async function decayStaleStates(storeId: string): Promise<number> {
  const staleThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Find states that haven't been updated in 7+ days AND are in active stages
  // (no need to recompute LOST customers — they're already at terminal state)
  const staleStates = await prisma.customerState.findMany({
    where: {
      storeId,
      lastStateUpdate: { lt: staleThreshold },
      lifecycleStage: {
        in: [
          LifecycleStage.CHAMPION,
          LifecycleStage.LOYAL,
          LifecycleStage.REPEAT,
          LifecycleStage.FIRST_BUYER,
          LifecycleStage.SUBSCRIBER,
          LifecycleStage.AT_RISK,
        ],
      },
    },
    select: { customerId: true },
    take: 500, // batch to avoid overwhelming the system
  });

  let updated = 0;
  for (const { customerId } of staleStates) {
    try {
      await computeFullState(customerId, storeId);
      updated++;
    } catch (err) {
      console.warn(`[state-decay] Failed to recompute state for ${customerId}:`, err);
    }
  }

  return updated;
}

function computeDiscountSensitivity(
  orders: { totalPrice: number; createdAt: Date }[],
): number {
  if (orders.length === 0) return 0.5;
  // Low AOV relative to store average suggests higher discount sensitivity
  // For now, use a simple heuristic based on order count and recency
  const avgPrice = orders.reduce((s, o) => s + o.totalPrice, 0) / orders.length;
  if (avgPrice < 30) return 0.8;
  if (avgPrice < 60) return 0.6;
  if (avgPrice < 100) return 0.4;
  return 0.2;
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
  churnRisk: number,
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

async function computeSupportState(
  customerId: string,
  storeId: string,
): Promise<SupportState> {
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
  supportState: SupportState,
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
