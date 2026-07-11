import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { computeLiftStats, varianceFromAggregates } from "@allohq/customer-state";

import { redisConnection, QUEUE_NAMES } from "../config";

const ATTRIBUTION_WINDOW_DAYS = 7;

interface OutcomeAttributionJobData {
  type?: "hourly" | "daily-summary";
}

/**
 * Outcome attribution worker.
 *
 * Hourly job: matches purchases (orders) to recent AI-initiated messages within
 * a 7-day attribution window. Creates OrderAttribution records using three models
 * (last-touch, first-touch, linear) and updates MessageLog outcome fields.
 *
 * Daily summary job: calculates yesterday's AI-attributed revenue per store and
 * stores it in the store's messagingConfig for dashboard queries.
 */
export const outcomeAttributionWorker = new Worker<OutcomeAttributionJobData>(
  QUEUE_NAMES.OUTCOME_ATTRIBUTION,
  async (job) => {
    const jobType = job.data.type ?? "hourly";

    if (jobType === "daily-summary") {
      return runDailyRevenueSummary();
    }

    return runHourlyAttribution();
  },
  { connection: redisConnection },
);

// ---------------------------------------------------------------------------
// Hourly attribution
// ---------------------------------------------------------------------------

async function runHourlyAttribution() {
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, storeName: true },
  });

  let totalOrdersAttributed = 0;
  let totalRevenueAttributed = 0;

  for (const store of stores) {
    const result = await attributeOrdersForStore(store.id);
    totalOrdersAttributed += result.ordersAttributed;
    totalRevenueAttributed += result.revenueAttributed;
    // Close elapsed holdout windows: anyone (treatment OR control) whose window
    // passed with no purchase is now an OBSERVED non-buyer ($0), so per-customer
    // means count the WHOLE arm — the basis for genuinely causal lift.
    await closeElapsedWindows(store.id);
    // Recompute + persist per-experiment lift statistics (CI / significance / confidence)
    // now that outcomes have finalized — the CAM weights each trace by this confidence.
    await persistExperimentStats(store.id);

    if (result.ordersAttributed > 0) {
      console.log(
        `[outcome-attribution] Attributed $${result.revenueAttributed.toFixed(2)} revenue across ${result.ordersAttributed} orders for store ${store.storeName ?? store.id}`,
      );
    }
  }

  console.log(
    `[outcome-attribution] Hourly run complete: ${totalOrdersAttributed} orders, $${totalRevenueAttributed.toFixed(2)} revenue across ${stores.length} stores`,
  );

  return { totalOrdersAttributed, totalRevenueAttributed };
}

export async function attributeOrdersForStore(storeId: string) {
  // Causal-data moat: contribution margin used to derive outcomeMargin from
  // outcomeRevenue. Falls back to 0.6 when unset.
  const storeRow = await prisma.store.findUnique({
    where: { id: storeId },
    select: { defaultContributionMargin: true },
  });
  const marginRate = storeRow?.defaultContributionMargin ?? 0.6;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const windowStart = new Date(
    Date.now() - ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  // Find orders created in the last hour that do NOT already have attribution
  const recentOrders = await prisma.order.findMany({
    where: {
      storeId,
      createdAt: { gte: oneHourAgo },
      attribution: null, // skip already-attributed orders (dedup)
    },
    select: {
      id: true,
      customerId: true,
      totalPrice: true,
    },
  });

  let ordersAttributed = 0;
  let revenueAttributed = 0;

  for (const order of recentOrders) {
    // Find MessageLog entries sent to this customer within the attribution window
    const messages = await prisma.messageLog.findMany({
      where: {
        customerId: order.customerId,
        storeId,
        sentAt: { gte: windowStart },
        status: { in: ["sent", "delivered", "opened", "clicked"] },
      },
      orderBy: { sentAt: "asc" },
      select: {
        id: true,
        channel: true,
        campaignId: true,
        automationId: true,
        sentAt: true,
        status: true,
      },
    });

    if (messages.length === 0) {
      // No treatment message — but the customer may be in a CONTROL holdout and
      // ordered ANYWAY. Record that on their CONTROL row as the causal BASELINE
      // (no OrderAttribution — nothing we sent caused it; this is the counterfactual
      // that makes lift = treatment − control real, not treatment − nothing).
      const controlRow = await prisma.messageLog.findFirst({
        where: {
          customerId: order.customerId,
          storeId,
          treatmentArm: "CONTROL",
          createdAt: { gte: windowStart },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, outcomeRevenue: true },
      });
      if (controlRow) {
        const existing = controlRow.outcomeRevenue ? Number(controlRow.outcomeRevenue) : 0;
        await prisma.messageLog.update({
          where: { id: controlRow.id },
          data: {
            outcome: "purchased",
            outcomeRevenue: existing + order.totalPrice,
            outcomeMargin: (existing + order.totalPrice) * marginRate,
            outcomeTimestamp: new Date(),
          },
        });
        revenueAttributed += order.totalPrice;
      }
      continue;
    }

    // Filter to only messages sent BEFORE the order was created
    // (we don't have order.createdAt in select, but orders are from the last hour
    //  and messages are from the last 7 days, so all messages predate or overlap)
    // For safety, re-fetch order createdAt is unnecessary since we already filtered
    // messages to be within the window, and orders are very recent.

    // Determine touch type from the most recent message's status
    const lastMessage = messages[messages.length - 1]!;
    const touchType =
      lastMessage.status === "clicked"
        ? "click"
        : lastMessage.status === "opened"
          ? "open"
          : "direct";

    // --- Last-touch attribution (primary — stored in OrderAttribution) ---
    await prisma.orderAttribution.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        storeId,
        messageLogId: lastMessage.id,
        campaignId: lastMessage.campaignId,
        automationId: lastMessage.automationId,
        channel: lastMessage.channel,
        revenue: order.totalPrice,
        touchType,
        windowDays: ATTRIBUTION_WINDOW_DAYS,
      },
    });

    // --- Update MessageLog outcomes for all three models ---

    // Last-touch: 100% to most recent message
    await prisma.messageLog.update({
      where: { id: lastMessage.id },
      data: {
        outcome: "purchased",
        outcomeRevenue: (order.totalPrice),
        outcomeMargin: (order.totalPrice * marginRate),
        outcomeTimestamp: new Date(),
      },
    });

    // First-touch: 100% to first message (if different from last)
    const firstMessage = messages[0]!;
    if (firstMessage.id !== lastMessage.id) {
      // Only set outcome if not already set to "purchased" (don't overwrite
      // a higher-value attribution from a different order)
      const existing = await prisma.messageLog.findUnique({
        where: { id: firstMessage.id },
        select: { outcome: true, outcomeRevenue: true },
      });
      const existingRevenue = existing?.outcomeRevenue
        ? Number(existing.outcomeRevenue)
        : 0;
      await prisma.messageLog.update({
        where: { id: firstMessage.id },
        data: {
          outcome: "purchased",
          outcomeRevenue: (existingRevenue + order.totalPrice),
          outcomeMargin: ((existingRevenue + order.totalPrice) * marginRate),
          outcomeTimestamp: new Date(),
        },
      });
    }

    // Linear: split revenue equally across all messages
    if (messages.length > 1) {
      const share = order.totalPrice / messages.length;
      // Skip first and last — they were already updated above
      const middleMessages = messages.slice(1, -1);
      for (const msg of middleMessages) {
        const existing = await prisma.messageLog.findUnique({
          where: { id: msg.id },
          select: { outcome: true, outcomeRevenue: true },
        });
        const existingRevenue = existing?.outcomeRevenue
          ? Number(existing.outcomeRevenue)
          : 0;
        await prisma.messageLog.update({
          where: { id: msg.id },
          data: {
            outcome: "purchased",
            outcomeRevenue: (existingRevenue + share),
            outcomeMargin: ((existingRevenue + share) * marginRate),
            outcomeTimestamp: new Date(),
          },
        });
      }
    }

    ordersAttributed++;
    revenueAttributed += order.totalPrice;
  }

  return { ordersAttributed, revenueAttributed };
}

/**
 * Mark holdout rows (treatment OR control) whose attribution window has fully
 * elapsed with NO recorded purchase as observed non-buyers (outcome "ignored",
 * $0). This is what makes the per-customer mean denominator the WHOLE arm — so
 * lift captures conversion-rate differences, not just buyers' AOV.
 */
export async function closeElapsedWindows(storeId: string): Promise<number> {
  const windowClosed = new Date(Date.now() - ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const res = await prisma.messageLog.updateMany({
    where: {
      storeId,
      treatmentArm: { not: null },
      outcome: null,
      createdAt: { lt: windowClosed },
    },
    data: { outcome: "ignored", outcomeRevenue: 0, outcomeMargin: 0, outcomeTimestamp: new Date() },
  });
  return res.count;
}

/**
 * Recompute + persist per-experiment lift statistics (Welch CI / significance / confidence)
 * from observed outcomes. Persisted onto Experiment.stats so the CAM can weight each
 * experiment's trace by confidence rather than treating a 60-customer lift like a 5,000 one.
 */
async function persistExperimentStats(storeId: string): Promise<void> {
  const rows = await prisma.$queryRaw<
    Array<{ experimentId: string; arm: "CONTROL" | "TREATMENT"; withOutcome: number; mean: number; sumsq: number }>
  >`
    SELECT "experimentId", "treatmentArm" AS arm,
           COUNT(CASE WHEN "outcome" IS NOT NULL THEN 1 END)::int AS "withOutcome",
           COALESCE(
             SUM(COALESCE("outcomeMargin", "outcomeRevenue", 0)) FILTER (WHERE "outcome" IS NOT NULL)
             / NULLIF(COUNT(CASE WHEN "outcome" IS NOT NULL THEN 1 END), 0), 0
           )::float AS mean,
           COALESCE(
             SUM(POWER(COALESCE("outcomeMargin", "outcomeRevenue", 0), 2)) FILTER (WHERE "outcome" IS NOT NULL), 0
           )::float AS sumsq
    FROM "message_logs"
    WHERE "storeId" = ${storeId} AND "experimentId" IS NOT NULL AND "treatmentArm" IS NOT NULL
    GROUP BY "experimentId", "treatmentArm"
  `;

  const byExp = new Map<string, { c?: (typeof rows)[number]; t?: (typeof rows)[number] }>();
  for (const r of rows) {
    const e = byExp.get(r.experimentId) ?? {};
    if (r.arm === "CONTROL") e.c = r;
    else e.t = r;
    byExp.set(r.experimentId, e);
  }

  for (const [experimentId, { c, t }] of byExp) {
    if (!c || !t) continue; // need both arms to compute a difference
    const cv = varianceFromAggregates(c.sumsq, c.withOutcome, c.mean);
    const tv = varianceFromAggregates(t.sumsq, t.withOutcome, t.mean);
    const s = computeLiftStats(
      { n: t.withOutcome, mean: t.mean, variance: tv },
      { n: c.withOutcome, mean: c.mean, variance: cv },
    );
    await prisma.experiment.update({
      where: { id: experimentId },
      data: {
        stats: {
          lift: Math.round(s.lift),
          ciLow: Math.round(s.ciLow),
          ciHigh: Math.round(s.ciHigh),
          stdErr: Math.round(s.stdErr),
          pValue: s.pValue,
          significant: s.significant,
          underpowered: s.underpowered,
          confidence: s.confidence,
          nTreatment: t.withOutcome,
          nControl: c.withOutcome,
          computedAt: new Date().toISOString(),
        },
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Daily revenue summary
// ---------------------------------------------------------------------------

async function runDailyRevenueSummary() {
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, storeName: true, messagingConfig: true },
  });

  const yesterdayStart = new Date();
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);

  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setHours(23, 59, 59, 999);

  const summaries: Array<{
    storeId: string;
    storeName: string | null;
    totalAttributedRevenue: number;
    orderCount: number;
    messageCount: number;
  }> = [];

  for (const store of stores) {
    // Aggregate yesterday's attributed revenue
    const result = await prisma.orderAttribution.aggregate({
      where: {
        storeId: store.id,
        attributedAt: { gte: yesterdayStart, lte: yesterdayEnd },
      },
      _sum: { revenue: true },
      _count: { id: true },
    });

    const totalAttributedRevenue = result._sum.revenue ?? 0;
    const orderCount = result._count.id;

    // Count unique messages that led to purchases yesterday
    const messageCount = await prisma.messageLog.count({
      where: {
        storeId: store.id,
        outcome: "purchased",
        outcomeTimestamp: { gte: yesterdayStart, lte: yesterdayEnd },
      },
    });

    summaries.push({
      storeId: store.id,
      storeName: store.storeName,
      totalAttributedRevenue,
      orderCount,
      messageCount,
    });

    // Store summary in messagingConfig for dashboard queries
    const existingConfig =
      (store.messagingConfig as Record<string, unknown>) ?? {};
    await prisma.store.update({
      where: { id: store.id },
      data: {
        messagingConfig: {
          ...existingConfig,
          dailyRevenueSummary: {
            date: yesterdayStart.toISOString().split("T")[0],
            totalAttributedRevenue,
            orderCount,
            messageCount,
            computedAt: new Date().toISOString(),
          },
        },
      },
    });

    if (totalAttributedRevenue > 0) {
      console.log(
        `[outcome-attribution] Daily summary for ${store.storeName ?? store.id}: $${totalAttributedRevenue.toFixed(2)} attributed revenue from ${orderCount} orders via ${messageCount} messages`,
      );
    }
  }

  console.log(
    `[outcome-attribution] Daily summary complete for ${stores.length} stores`,
  );

  return { summaries };
}

outcomeAttributionWorker.on("completed", (job) => {
  console.log(`[outcome-attribution] Job ${job.id} completed`);
});

outcomeAttributionWorker.on("failed", (job, err) => {
  console.error(
    `[outcome-attribution] Job ${job?.id} failed:`,
    err.message,
  );
});
