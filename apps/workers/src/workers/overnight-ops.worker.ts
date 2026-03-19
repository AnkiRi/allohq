import { Worker, Queue } from "bullmq";
import { prisma } from "@allohq/database";
import { logActivity } from "@allohq/agent-core";
import { scanOpportunities } from "@allohq/campaign-engine";
import { redisConnection, QUEUE_NAMES } from "../config";

const journeyStepQueue = new Queue(QUEUE_NAMES.JOURNEY_STEP, { connection: redisConnection });
const campaignFactoryQueue = new Queue(QUEUE_NAMES.CAMPAIGN_FACTORY, { connection: redisConnection });

const CART_RECOVERY_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const CHURN_RISK_THRESHOLD = 0.7;
const OUTREACH_COOLDOWN_DAYS = 14;
const AB_TEST_MIN_SAMPLE_SIZE = 100;

interface OvernightOpsJobData {
  type?: string;
}

/**
 * Overnight Ops Worker.
 *
 * The heart of the autonomous agent. Runs every 2 hours and for each active store:
 * - Checks autopilot cart_recovery: finds recent abandoned carts without recovery emails, triggers journey
 * - Checks autopilot win_back: finds high churn risk customers without recent outreach, triggers journey
 * - For copilot/advisor categories: creates ActionQueue entries
 * - Evaluates running A/B tests — auto-concludes when sample size reached
 * - Scans for campaign opportunities
 * - Logs everything to AgentActivityLog
 */
export const overnightOpsWorker = new Worker<OvernightOpsJobData>(
  QUEUE_NAMES.OVERNIGHT_OPS,
  async (_job) => {
    console.log(`[overnight-ops] Starting overnight ops scan`);

    const stores = await prisma.store.findMany({
      where: { isActive: true, onboardingCompletedAt: { not: null } },
      select: { id: true, timezone: true },
    });

    let totalCartRecoveries = 0;
    let totalWinBacks = 0;
    let totalAbTestsConcluded = 0;
    let totalOpportunities = 0;
    let totalActionsQueued = 0;

    for (const store of stores) {
      try {
        const result = await processStore(store.id);
        totalCartRecoveries += result.cartRecoveries;
        totalWinBacks += result.winBacks;
        totalAbTestsConcluded += result.abTestsConcluded;
        totalOpportunities += result.opportunities;
        totalActionsQueued += result.actionsQueued;
      } catch (err) {
        console.error(`[overnight-ops] Error processing store ${store.id}:`, (err as Error).message);
      }
    }

    console.log(
      `[overnight-ops] Scan complete: ${stores.length} stores, ` +
      `${totalCartRecoveries} cart recoveries, ${totalWinBacks} win-backs, ` +
      `${totalAbTestsConcluded} A/B tests concluded, ${totalOpportunities} opportunities, ` +
      `${totalActionsQueued} actions queued`
    );

    return {
      storesProcessed: stores.length,
      totalCartRecoveries,
      totalWinBacks,
      totalAbTestsConcluded,
      totalOpportunities,
      totalActionsQueued,
    };
  },
  { connection: redisConnection, concurrency: 1 },
);

async function processStore(storeId: string) {
  let cartRecoveries = 0;
  let winBacks = 0;
  let abTestsConcluded = 0;
  let opportunities = 0;
  let actionsQueued = 0;

  // Load autonomy configs for this store
  const autonomyConfigs = await prisma.autonomyConfig.findMany({
    where: { storeId },
  });

  const configMap = new Map(autonomyConfigs.map((c) => [c.category, c]));

  // ── 1. Autopilot Cart Recovery ──────────────────────────────────────────
  const cartRecoveryConfig = configMap.get("cart_recovery");
  if (cartRecoveryConfig?.tier === "autopilot") {
    try {
      const since = new Date(Date.now() - CART_RECOVERY_WINDOW_MS);

      // Find abandoned carts in the last 2h without a recovery journey
      const abandonedCarts = await prisma.abandonedCheckout.findMany({
        where: {
          storeId,
          status: "abandoned",
          abandonedAt: { gte: since },
        },
        select: { id: true, customerId: true, email: true, totalPrice: true },
      });

      for (const cart of abandonedCarts) {
        if (!cart.customerId) continue;

        // Check if a recovery journey already exists for this customer
        const existingJourney = await prisma.customerJourney.findFirst({
          where: {
            storeId,
            customerId: cart.customerId,
            journeyType: "cart_recovery",
            status: "active",
          },
        });

        if (existingJourney) continue;

        // Trigger a cart recovery journey step
        await journeyStepQueue.add("cart-recovery", {
          storeId,
          customerId: cart.customerId,
          journeyType: "cart_recovery",
          checkoutId: cart.id,
        });

        await logActivity({
          storeId,
          activityType: "cart_recovery_sent",
          summary: `Triggered cart recovery for abandoned checkout ($${cart.totalPrice.toFixed(2)})`,
          category: "cart_recovery",
          tier: "autopilot",
          actionTaken: "triggered_journey",
          entityId: cart.id,
          entityType: "abandoned_checkout",
          revenue: cart.totalPrice,
        });

        cartRecoveries++;
      }
    } catch (err) {
      console.error(`[overnight-ops] Cart recovery error for store ${storeId}:`, (err as Error).message);
    }
  }

  // ── 2. Autopilot Win-Back ───────────────────────────────────────────────
  const winBackConfig = configMap.get("win_back");
  if (winBackConfig?.tier === "autopilot") {
    try {
      const cooldownCutoff = new Date(Date.now() - OUTREACH_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

      // Find customers with high churn risk
      const atRiskCustomers = await prisma.customerState.findMany({
        where: {
          storeId,
          churnRisk: { gte: CHURN_RISK_THRESHOLD },
        },
        select: { customerId: true, churnRisk: true },
        orderBy: { churnRisk: "desc" },
        take: 20,
      });

      for (const state of atRiskCustomers) {
        // Check cooldown: no recent win-back journey
        const recentOutreach = await prisma.customerJourney.findFirst({
          where: {
            storeId,
            customerId: state.customerId,
            journeyType: { in: ["winback", "win_back"] },
            startedAt: { gte: cooldownCutoff },
          },
        });

        if (recentOutreach) continue;

        // Also check action queue cooldown
        const recentAction = await prisma.actionQueue.findFirst({
          where: {
            storeId,
            type: "churn_intervention",
            createdAt: { gte: cooldownCutoff },
            payload: { path: ["customerId"], equals: state.customerId },
          },
        });

        if (recentAction) continue;

        await journeyStepQueue.add("win-back", {
          storeId,
          customerId: state.customerId,
          journeyType: "winback",
          churnRisk: state.churnRisk,
        });

        await logActivity({
          storeId,
          activityType: "churn_intervention",
          summary: `Triggered win-back journey for customer with ${Math.round(state.churnRisk * 100)}% churn risk`,
          category: "win_back",
          tier: "autopilot",
          actionTaken: "triggered_journey",
          entityId: state.customerId,
          entityType: "customer",
        });

        winBacks++;
      }
    } catch (err) {
      console.error(`[overnight-ops] Win-back error for store ${storeId}:`, (err as Error).message);
    }
  }

  // ── 3. Copilot/Advisor categories → ActionQueue ─────────────────────────
  for (const config of autonomyConfigs) {
    if (config.tier === "autopilot") continue; // already handled above

    try {
      // For copilot/advisor tiers, check if there's pending work and queue actions
      if (config.category === "cart_recovery") {
        const since = new Date(Date.now() - CART_RECOVERY_WINDOW_MS);
        const abandonedCount = await prisma.abandonedCheckout.count({
          where: { storeId, status: "abandoned", abandonedAt: { gte: since } },
        });

        if (abandonedCount > 0) {
          const existing = await prisma.actionQueue.findFirst({
            where: { storeId, type: "cart_recovery", status: "pending", category: "cart_recovery" },
          });

          if (!existing) {
            await prisma.actionQueue.create({
              data: {
                storeId,
                type: "cart_recovery",
                status: "pending",
                category: config.category,
                urgencyScore: 70,
                confidenceScore: 80,
                reasoning: `${abandonedCount} abandoned cart(s) detected in the last 2 hours. Review and approve recovery campaign.`,
                payload: { abandonedCount, tier: config.tier },
              },
            });

            await logActivity({
              storeId,
              activityType: "cart_recovery_sent",
              summary: `Queued ${abandonedCount} abandoned cart recoveries for review (${config.tier})`,
              category: "cart_recovery",
              tier: config.tier,
              actionTaken: "queued_for_review",
            });

            actionsQueued++;
          }
        }
      }

      if (config.category === "win_back") {
        const atRiskCount = await prisma.customerState.count({
          where: { storeId, churnRisk: { gte: CHURN_RISK_THRESHOLD } },
        });

        if (atRiskCount > 0) {
          const existing = await prisma.actionQueue.findFirst({
            where: { storeId, type: "churn_intervention", status: "pending", category: "win_back" },
          });

          if (!existing) {
            await prisma.actionQueue.create({
              data: {
                storeId,
                type: "churn_intervention",
                status: "pending",
                category: config.category,
                urgencyScore: 75,
                confidenceScore: 70,
                reasoning: `${atRiskCount} customer(s) with high churn risk (>70%). Review and approve win-back interventions.`,
                payload: { atRiskCount, tier: config.tier },
              },
            });

            await logActivity({
              storeId,
              activityType: "churn_intervention",
              summary: `Queued win-back for ${atRiskCount} at-risk customers for review (${config.tier})`,
              category: "win_back",
              tier: config.tier,
              actionTaken: "queued_for_review",
            });

            actionsQueued++;
          }
        }
      }
    } catch (err) {
      console.error(`[overnight-ops] Copilot action error (${config.category}) for store ${storeId}:`, (err as Error).message);
    }
  }

  // ── 4. A/B Test evaluation ──────────────────────────────────────────────
  try {
    const runningTests = await prisma.aBTest.findMany({
      where: { storeId, status: "running" },
    });

    for (const test of runningTests) {
      const results = test.results as Record<string, any> | null;
      if (!results) continue;

      const sentA = results.a?.sent ?? 0;
      const sentB = results.b?.sent ?? 0;
      const totalSent = sentA + sentB;

      if (totalSent < (test.minSampleSize || AB_TEST_MIN_SAMPLE_SIZE)) continue;

      // Calculate performance for each variant
      const rateA = sentA > 0 ? (results.a?.clicked ?? 0) / sentA : 0;
      const rateB = sentB > 0 ? (results.b?.clicked ?? 0) / sentB : 0;

      // Simple winner determination
      const winner = rateA > rateB ? "a" : rateB > rateA ? "b" : null;
      const confidence = totalSent > 200 ? 0.95 : totalSent > 100 ? 0.85 : 0.7;

      await prisma.aBTest.update({
        where: { id: test.id },
        data: {
          status: "concluded",
          winner,
          confidence,
          concludedAt: new Date(),
        },
      });

      await logActivity({
        storeId,
        activityType: "ab_test_concluded",
        summary: `A/B test "${test.name}" concluded: ${winner ? `Variant ${winner.toUpperCase()} wins` : "No clear winner"} (${totalSent} sends, ${Math.round(confidence * 100)}% confidence)`,
        category: test.variable,
        actionTaken: "auto_concluded",
        entityId: test.id,
        entityType: "ab_test",
        metadata: { winner, confidence, sentA, sentB, rateA, rateB },
      });

      abTestsConcluded++;
    }
  } catch (err) {
    console.error(`[overnight-ops] A/B test evaluation error for store ${storeId}:`, (err as Error).message);
  }

  // ── 5. Scan for campaign opportunities ──────────────────────────────────
  try {
    const opps = await scanOpportunities(storeId);
    opportunities = opps.length;

    for (const opp of opps) {
      await campaignFactoryQueue.add("generate-draft", { opportunity: opp });

      await logActivity({
        storeId,
        activityType: "campaign_opportunity",
        summary: `Identified campaign opportunity: ${opp.reasoning || opp.type}`,
        category: opp.type,
        actionTaken: "queued_for_review",
        metadata: { opportunity: opp },
      });
    }
  } catch (err) {
    console.error(`[overnight-ops] Opportunity scan error for store ${storeId}:`, (err as Error).message);
  }

  return { cartRecoveries, winBacks, abTestsConcluded, opportunities, actionsQueued };
}

overnightOpsWorker.on("completed", (job) => {
  console.log(`[overnight-ops] Job ${job.id} completed`);
});

overnightOpsWorker.on("failed", (job, err) => {
  console.error(`[overnight-ops] Job ${job?.id} failed:`, err.message);
});
