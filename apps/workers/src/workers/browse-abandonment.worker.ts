import { Worker, Queue } from "bullmq";
import { prisma } from "@allohq/database";
import { logAgentActivity } from "@allohq/agent-core";
import {
  getAutonomyTier,
  proposeAction,
  scoreUrgency,
  scoreConfidence,
  ActionCategory,
  AutonomyTier,
} from "@allohq/autonomy-engine";
import { redisConnection, QUEUE_NAMES } from "../config";

const journeyStepQueue = new Queue(QUEUE_NAMES.JOURNEY_STEP, { connection: redisConnection });
const eventReactQueue = new Queue(QUEUE_NAMES.EVENT_REACT, { connection: redisConnection });

const BROWSE_WINDOW_START_MS = 1 * 60 * 60 * 1000; // 1 hour ago
const BROWSE_WINDOW_END_MS = 2 * 60 * 60 * 1000;   // 2 hours ago
const FATIGUE_COOLDOWN_DAYS = 3; // Don't send browse abandon if emailed in last 3 days
const BATCH_SIZE = 100;

interface BrowseAbandonmentJobData {
  type: string;
}

/**
 * Browse Abandonment Worker.
 * Runs every 30 minutes. Finds customers who browsed products 1-2 hours ago
 * but didn't purchase, and routes through the autonomy engine.
 */
export const browseAbandonmentWorker = new Worker<BrowseAbandonmentJobData>(
  QUEUE_NAMES.BROWSE_ABANDONMENT,
  async (_job) => {
    console.log(`[browse-abandonment] Starting scan...`);

    const now = Date.now();
    const windowStart = new Date(now - BROWSE_WINDOW_END_MS);   // 2 hours ago
    const windowEnd = new Date(now - BROWSE_WINDOW_START_MS);   // 1 hour ago

    const stores = await prisma.store.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    let totalTriggered = 0;
    let totalSkipped = 0;

    for (const store of stores) {
      try {
        const result = await processStoreBrowseAbandonment(store.id, windowStart, windowEnd);
        totalTriggered += result.triggered;
        totalSkipped += result.skipped;
      } catch (err) {
        console.error(`[browse-abandonment] Error processing store ${store.id}:`, (err as Error).message);
      }
    }

    console.log(
      `[browse-abandonment] Scanned ${stores.length} stores, triggered ${totalTriggered}, skipped ${totalSkipped}`,
    );
    return { storesScanned: stores.length, totalTriggered, totalSkipped };
  },
  { connection: redisConnection },
);

async function processStoreBrowseAbandonment(
  storeId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<{ triggered: number; skipped: number }> {
  // Find browse events from 1-2 hours ago with a customerId
  const browseEvents = await prisma.browseEvent.findMany({
    where: {
      storeId,
      customerId: { not: null },
      createdAt: { gte: windowStart, lte: windowEnd },
    },
    orderBy: { createdAt: "desc" },
    take: BATCH_SIZE * 5, // Fetch more since we'll group by customer
  });

  if (browseEvents.length === 0) return { triggered: 0, skipped: 0 };

  // Group by customer
  const customerBrowse = new Map<string, typeof browseEvents>();
  for (const event of browseEvents) {
    if (!event.customerId) continue;
    const existing = customerBrowse.get(event.customerId) ?? [];
    existing.push(event);
    customerBrowse.set(event.customerId, existing);
  }

  let triggered = 0;
  let skipped = 0;

  const fatigueCutoff = new Date(Date.now() - FATIGUE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  for (const [customerId, events] of customerBrowse) {
    if (triggered >= BATCH_SIZE) break;

    try {
      // Get all unique product IDs this customer browsed
      const productIds = [...new Set(events.map((e) => e.productId))];

      // Check if customer already purchased any of the viewed products
      const existingOrders = await prisma.orderItem.findMany({
        where: {
          order: {
            storeId,
            customerId,
          },
          productId: { in: productIds },
        },
        select: { productId: true },
      });

      const purchasedProductIds = new Set(existingOrders.map((o) => o.productId));
      const unboughtProductIds = productIds.filter((pid) => !purchasedProductIds.has(pid));

      if (unboughtProductIds.length === 0) {
        skipped++;
        continue;
      }

      // Check if customer already received a browse abandon email recently
      const recentOutreach = await prisma.proactiveOutreachLog.findFirst({
        where: {
          storeId,
          customerId,
          outreachType: "browse_abandon",
          createdAt: { gte: fatigueCutoff },
        },
      });

      if (recentOutreach) {
        skipped++;
        continue;
      }

      // Also check fatigue log
      const recentFatigue = await prisma.customerFatigueLog.findFirst({
        where: {
          storeId,
          customerId,
          messageType: "automation",
          sentAt: { gte: fatigueCutoff },
        },
      });

      if (recentFatigue) {
        skipped++;
        continue;
      }

      // Check autonomy config for browse_abandonment / cart_recovery category
      const tier = await getAutonomyTier(storeId, ActionCategory.CART_RECOVERY);

      const payload: Record<string, unknown> = {
        customerId,
        productIds: unboughtProductIds,
        browseCount: events.length,
        mostRecentBrowse: events[0]?.createdAt,
        source: "browse_abandonment_scan",
      };

      if (tier === AutonomyTier.AUTOPILOT) {
        // Queue to journey-step to send browse abandonment email
        await journeyStepQueue.add("browse-abandon-journey", {
          storeId,
          customerId,
          eventType: "browse_abandon",
          payload,
          source: "browse-abandonment-worker",
        });

        // Also queue to event-react for unified tracking
        await eventReactQueue.add("browse-abandon-event", {
          storeId,
          eventType: "browse_abandon",
          customerId,
          payload,
        });

        // Log outreach
        await prisma.proactiveOutreachLog.create({
          data: {
            storeId,
            customerId,
            outreachType: "browse_abandon",
            referenceId: unboughtProductIds[0]!,
            channel: "email",
          },
        }).catch(() => {});

        triggered++;
      } else {
        // For copilot/advisor: create ActionQueue entry
        const urgency = scoreUrgency({
          type: "browse_abandon",
          daysSinceLastOrder: undefined,
          churnRisk: undefined,
        });

        const confidence = await scoreConfidence({
          storeId,
          type: "browse_abandon",
          segmentSize: 1,
          hasCustomerState: true,
          hasBrandProfile: true,
        });

        await proposeAction(
          {
            storeId,
            type: "browse_abandon",
            category: ActionCategory.CART_RECOVERY,
            reasoning: `Customer browsed ${unboughtProductIds.length} product(s) ${events.length} time(s) in the last 1-2 hours but didn't purchase. Recommend browse abandonment follow-up.`,
            payload,
            expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          },
          urgency,
          confidence,
        );

        triggered++;
      }

      // Log to AgentActivityLog
      await prisma.agentActivityLog.create({
        data: {
          storeId,
          activityType: "browse_abandon",
          summary: `Browse abandonment detected: customer viewed ${unboughtProductIds.length} product(s) — ${tier === AutonomyTier.AUTOPILOT ? "auto-triggered journey" : "queued for review"}`,
          category: ActionCategory.CART_RECOVERY,
          tier,
          actionTaken: tier === AutonomyTier.AUTOPILOT ? "triggered_journey" : "queued_for_review",
          entityId: customerId,
          entityType: "customer",
          metadata: payload as any,
        },
      }).catch(() => {});
    } catch (err) {
      console.error(`[browse-abandonment] Error processing customer ${customerId}:`, (err as Error).message);
    }
  }

  if (triggered > 0) {
    await logAgentActivity(
      storeId,
      `Browse abandonment scan: triggered **${triggered}** follow-up${triggered === 1 ? "" : "s"}, skipped ${skipped}`,
      { type: "browse_abandonment_scan" },
    ).catch(() => {});
  }

  return { triggered, skipped };
}

browseAbandonmentWorker.on("completed", (job) => {
  console.log(`[browse-abandonment] Job ${job.id} completed`);
});

browseAbandonmentWorker.on("failed", (job, err) => {
  console.error(`[browse-abandonment] Job ${job?.id} failed:`, err.message);
});
