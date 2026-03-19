import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { logAgentActivity } from "@allohq/agent-core";
import {
  proposeAction,
  scoreUrgency,
  scoreConfidence,
  ActionCategory,
} from "@allohq/autonomy-engine";
import { checkAllRules } from "@allohq/communication-governor";
import { redisConnection, QUEUE_NAMES } from "../config";

const CHURN_RISK_THRESHOLD = 0.7;
const INTERVENTION_COOLDOWN_DAYS = 14;
const BATCH_SIZE = 50;
const NEWLY_AT_RISK_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours — matches scan frequency

interface ChurnInterventionJobData {
  storeId?: string; // If set, scan single store; otherwise scan all active stores
  type: string;
}

/**
 * Churn Intervention Worker.
 * Scheduled daily. Finds customers with high churn risk and proposes
 * personalized retention interventions through the autonomy engine.
 */
export const churnInterventionWorker = new Worker<ChurnInterventionJobData>(
  QUEUE_NAMES.CHURN_INTERVENTION,
  async (job) => {
    const { storeId } = job.data;

    const storeIds: string[] = [];
    if (storeId) {
      storeIds.push(storeId);
    } else {
      const stores = await prisma.store.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      storeIds.push(...stores.map((s) => s.id));
    }

    let totalInterventions = 0;
    let totalSkipped = 0;

    for (const sid of storeIds) {
      try {
        const result = await processStoreChurn(sid);
        totalInterventions += result.interventions;
        totalSkipped += result.skipped;
      } catch (err) {
        console.error(`[churn-intervention] Error processing store ${sid}:`, (err as Error).message);
      }
    }

    console.log(
      `[churn-intervention] Scanned ${storeIds.length} stores, proposed ${totalInterventions} interventions, skipped ${totalSkipped}`
    );
    return { storesScanned: storeIds.length, totalInterventions, totalSkipped };
  },
  { connection: redisConnection },
);

async function processStoreChurn(storeId: string): Promise<{ interventions: number; skipped: number }> {
  const cooldownCutoff = new Date(Date.now() - INTERVENTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  // Find customers who *newly* crossed the churn risk threshold since last scan
  const newlyAtRiskCutoff = new Date(Date.now() - NEWLY_AT_RISK_WINDOW_MS);

  const atRiskCustomers = await prisma.customerState.findMany({
    where: {
      storeId,
      churnRisk: { gte: CHURN_RISK_THRESHOLD },
      updatedAt: { gte: newlyAtRiskCutoff }, // Only target newly at-risk customers
    },
    include: {
      customer: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          acceptsMarketing: true,
          orders: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              totalPrice: true,
              createdAt: true,
              items: true,
            },
          },
        },
      },
    },
    orderBy: { churnRisk: "desc" },
    take: BATCH_SIZE,
  });

  let interventions = 0;
  let skipped = 0;

  for (const state of atRiskCustomers) {
    try {
      // Check if an intervention was already sent recently via the action queue
      const recentIntervention = await prisma.actionQueue.findFirst({
        where: {
          storeId,
          type: "churn_intervention",
          status: { in: ["pending", "approved", "executed"] },
          createdAt: { gte: cooldownCutoff },
          payload: {
            path: ["customerId"],
            equals: state.customerId,
          },
        },
      });

      if (recentIntervention) {
        skipped++;
        continue;
      }

      // Select optimal channel from channelPreference
      const channelPreference = (state.channelPreference as Record<string, number>) ?? {};
      const channel = selectBestChannel(channelPreference, state.customer.phone, state.customer.email);

      if (!channel) {
        skipped++;
        continue;
      }

      // Run communication governor checks
      const governorDecision = await checkAllRules({
        customerId: state.customerId,
        storeId,
        channel,
        messageType: "automation",
      });

      if (!governorDecision.allowed) {
        skipped++;
        continue;
      }

      // Build personalization context
      const recentOrders = state.customer.orders;
      const lastOrder = recentOrders[0];
      const daysSinceLastOrder = lastOrder
        ? Math.round((Date.now() - lastOrder.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      const totalOrderValue = recentOrders.reduce(
        (sum, o) => sum + (typeof o.totalPrice === "number" ? o.totalPrice : parseFloat(String(o.totalPrice)) || 0),
        0,
      );

      const customerName = [state.customer.firstName, state.customer.lastName].filter(Boolean).join(" ") || "Valued Customer";

      // Score urgency and confidence
      const urgency = scoreUrgency({
        type: "churn_intervention",
        daysSinceLastOrder,
        churnRisk: state.churnRisk,
      });

      const confidence = await scoreConfidence({
        storeId,
        type: "churn_intervention",
        segmentSize: 1,
        hasCustomerState: true,
        hasBrandProfile: true,
      });

      // Determine intervention strategy based on customer profile
      const strategy = determineStrategy(state);

      // Build action payload with all context needed for message generation
      const payload: Record<string, unknown> = {
        customerId: state.customerId,
        customerEmail: state.customer.email,
        customerName,
        channel,
        churnRisk: state.churnRisk,
        lifecycleStage: state.lifecycleStage,
        vipLevel: state.vipLevel,
        discountSensitivity: state.discountSensitivity,
        daysSinceLastOrder,
        recentOrderCount: recentOrders.length,
        totalRecentOrderValue: totalOrderValue,
        lastOrderItems: lastOrder?.items ?? [],
        strategy,
        interventionType: strategy.type,
        suggestedOffer: strategy.offer,
        suggestedMessage: strategy.messageDraft,
      };

      // Propose action through autonomy engine
      const result = await proposeAction(
        {
          storeId,
          type: "churn_intervention",
          category: ActionCategory.WIN_BACK,
          reasoning: `Customer ${customerName} has ${Math.round(state.churnRisk * 100)}% churn risk (${state.lifecycleStage}, ${state.vipLevel}). ${daysSinceLastOrder != null ? `Last order ${daysSinceLastOrder} days ago.` : "No recent orders."} Recommended: ${strategy.type} via ${channel}.`,
          estimatedRevenue: estimatePreservedRevenue(totalOrderValue, state.churnRisk, state.vipLevel),
          payload,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // expires in 7 days
        },
        urgency,
        confidence,
      );

      if (result.id) {
        interventions++;

        // Log to AgentActivityLog for overnight ops visibility
        await prisma.agentActivityLog.create({
          data: {
            storeId,
            activityType: "churn_intervention",
            summary: `Churn intervention proposed for ${customerName} — ${Math.round(state.churnRisk * 100)}% risk, strategy: ${strategy.type}`,
            category: "win_back",
            tier: result.autoExecuted ? "autopilot" : "copilot",
            actionTaken: result.autoExecuted ? "triggered_journey" : "queued_for_review",
            entityId: state.customerId,
            entityType: "customer",
            metadata: {
              churnRisk: state.churnRisk,
              lifecycleStage: state.lifecycleStage,
              vipLevel: state.vipLevel,
              strategy: strategy.type,
              channel,
            },
          },
        }).catch(() => {});
      }
    } catch (err) {
      console.error(
        `[churn-intervention] Error processing customer ${state.customerId}:`,
        (err as Error).message,
      );
    }
  }

  if (interventions > 0) {
    await logAgentActivity(
      storeId,
      `Identified **${interventions}** at-risk customer${interventions === 1 ? "" : "s"} for churn intervention — routing through autonomy engine`,
      { type: "churn_intervention_scan" },
    ).catch(() => {});
  }

  return { interventions, skipped };
}

/**
 * Select the best channel based on preference scores and availability.
 */
function selectBestChannel(
  preferences: Record<string, number>,
  phone: string | null,
  email: string | null,
): string | null {
  const channels: Array<{ name: string; score: number }> = [];

  if (email && preferences.email != null) {
    channels.push({ name: "email", score: preferences.email ?? 0.5 });
  } else if (email) {
    channels.push({ name: "email", score: 0.5 });
  }

  if (phone && preferences.whatsapp != null) {
    channels.push({ name: "whatsapp", score: preferences.whatsapp ?? 0 });
  }

  if (phone && preferences.sms != null) {
    channels.push({ name: "sms", score: preferences.sms ?? 0.3 });
  }

  if (channels.length === 0) {
    // Fallback: email if available
    if (email) return "email";
    return null;
  }

  channels.sort((a, b) => b.score - a.score);
  return channels[0]!.name;
}

/**
 * Determine the intervention strategy based on customer state.
 */
function determineStrategy(state: {
  churnRisk: number;
  lifecycleStage: string;
  vipLevel: string;
  discountSensitivity: number;
}): { type: string; offer: string | null; messageDraft: string } {
  const isVip = state.vipLevel !== "standard";
  const isDiscountSensitive = state.discountSensitivity > 0.6;
  const isHighRisk = state.churnRisk >= 0.85;

  if (isVip && isHighRisk) {
    return {
      type: "vip_personal_outreach",
      offer: "exclusive_early_access",
      messageDraft: "We miss you! As a valued VIP customer, we'd love to give you exclusive early access to our upcoming collection.",
    };
  }

  if (isHighRisk && isDiscountSensitive) {
    return {
      type: "win_back_discount",
      offer: "15_percent_off",
      messageDraft: "We noticed it's been a while! Here's 15% off your next order — we'd love to welcome you back.",
    };
  }

  if (isHighRisk) {
    return {
      type: "win_back_value",
      offer: "free_shipping",
      messageDraft: "It's been a while since your last visit. We've got new arrivals we think you'll love — plus free shipping on us.",
    };
  }

  if (isDiscountSensitive) {
    return {
      type: "engagement_discount",
      offer: "10_percent_off",
      messageDraft: "We have something special just for you — 10% off your next order. Don't miss out!",
    };
  }

  return {
    type: "engagement_content",
    offer: null,
    messageDraft: "We've been curating something special based on your preferences. Come take a look at what's new!",
  };
}

/**
 * Estimate preserved revenue if the intervention succeeds.
 */
function estimatePreservedRevenue(
  recentOrderValue: number,
  churnRisk: number,
  vipLevel: string,
): number {
  const vipMultiplier: Record<string, number> = {
    standard: 1,
    silver: 1.5,
    gold: 2,
    platinum: 3,
  };

  // Estimate: average order value * probability of saving them * VIP multiplier
  const avgOrderValue = recentOrderValue > 0 ? recentOrderValue / 3 : 50; // fallback $50
  // Higher churn risk → lower save probability (harder to save)
  const saveProbability = Math.max(0.1, 0.5 - churnRisk * 0.3);
  const multiplier = vipMultiplier[vipLevel] ?? 1;

  return Math.round(avgOrderValue * saveProbability * multiplier * 100) / 100;
}

churnInterventionWorker.on("completed", (job) => {
  console.log(`[churn-intervention] Job ${job.id} completed`);
});

churnInterventionWorker.on("failed", (job, err) => {
  console.error(`[churn-intervention] Job ${job?.id} failed:`, err.message);
});
