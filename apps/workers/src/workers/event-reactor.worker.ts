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

interface EventReactJobData {
  storeId: string;
  eventType: "order_placed" | "cart_abandoned" | "price_drop" | "back_in_stock" | "browse_abandon" | "churn_risk_high";
  customerId?: string;
  payload: Record<string, unknown>;
}

/** Map event types to their autonomy action categories */
const EVENT_CATEGORY_MAP: Record<string, ActionCategory> = {
  order_placed: ActionCategory.POST_PURCHASE,
  cart_abandoned: ActionCategory.CART_RECOVERY,
  price_drop: ActionCategory.PRICE_DROP,
  back_in_stock: ActionCategory.RESTOCK_ALERTS,
  browse_abandon: ActionCategory.CART_RECOVERY,
  churn_risk_high: ActionCategory.WIN_BACK,
};

/**
 * Event Reactor Worker.
 * Centralized event processor that receives events from various sources
 * and routes them through the autonomy engine for action.
 */
export const eventReactorWorker = new Worker<EventReactJobData>(
  QUEUE_NAMES.EVENT_REACT,
  async (job) => {
    const { storeId, eventType, customerId, payload } = job.data;
    console.log(`[event-reactor] Processing ${eventType} for store ${storeId}`);

    const category = EVENT_CATEGORY_MAP[eventType];
    if (!category) {
      console.warn(`[event-reactor] Unknown event type: ${eventType}`);
      return { status: "skipped", reason: "unknown_event_type" };
    }

    // Load autonomy config for this category
    const tier = await getAutonomyTier(storeId, category);

    // Score urgency
    const urgency = scoreUrgency({
      type: eventType,
      daysSinceLastOrder: (payload.daysSinceLastOrder as number) ?? null,
      churnRisk: (payload.churnRisk as number) ?? null,
    });

    // Score confidence
    const confidence = await scoreConfidence({
      storeId,
      type: eventType,
      segmentSize: 1,
      hasCustomerState: !!customerId,
      hasBrandProfile: true,
    });

    const reasoning = buildReasoning(eventType, customerId, payload);

    if (tier === AutonomyTier.AUTOPILOT) {
      // Trigger journey directly
      await journeyStepQueue.add("event-triggered-journey", {
        storeId,
        customerId,
        eventType,
        payload,
        source: "event-reactor",
      });

      await logAgentActivity(storeId, `Auto-triggered **${eventType}** journey${customerId ? ` for customer` : ""} — autopilot mode`, {
        type: "event_react_autopilot",
        entityId: customerId,
        entityType: customerId ? "customer" : undefined,
      }).catch(() => {});

      // Also log to AgentActivityLog table
      await prisma.agentActivityLog.create({
        data: {
          storeId,
          activityType: eventType,
          summary: reasoning,
          category: category,
          tier: "autopilot",
          actionTaken: "triggered_journey",
          entityId: customerId,
          entityType: customerId ? "customer" : undefined,
          metadata: payload as any,
        },
      }).catch((err) => {
        console.warn(`[event-reactor] Failed to log activity: ${(err as Error).message}`);
      });

      return { status: "autopilot", eventType };
    }

    // For copilot/advisor: create ActionQueue entry with reasoning
    const result = await proposeAction(
      {
        storeId,
        type: eventType,
        category,
        reasoning,
        estimatedRevenue: (payload.estimatedRevenue as number) ?? undefined,
        payload: { ...payload, customerId },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      urgency,
      confidence,
    );

    const actionTaken = tier === AutonomyTier.COPILOT ? "queued_for_review" : "advisor_suggestion";

    await prisma.agentActivityLog.create({
      data: {
        storeId,
        activityType: eventType,
        summary: reasoning,
        category: category,
        tier: tier,
        actionTaken,
        entityId: customerId ?? result.id,
        entityType: customerId ? "customer" : "action",
        metadata: payload as any,
      },
    }).catch((err) => {
      console.warn(`[event-reactor] Failed to log activity: ${(err as Error).message}`);
    });

    await logAgentActivity(storeId, `Proposed **${eventType}** action (${tier} mode) — ${reasoning}`, {
      type: `event_react_${tier}`,
      entityId: result.id,
      entityType: "action",
    }).catch(() => {});

    return { status: tier, actionId: result.id, eventType };
  },
  { connection: redisConnection },
);

function buildReasoning(
  eventType: string,
  customerId: string | undefined,
  payload: Record<string, unknown>,
): string {
  switch (eventType) {
    case "order_placed":
      return `Order placed${customerId ? " by customer" : ""} — trigger post-purchase follow-up`;
    case "cart_abandoned":
      return `Cart abandoned${payload.totalPrice ? ` (value: $${payload.totalPrice})` : ""} — send recovery email`;
    case "price_drop":
      return `Price dropped on product${payload.productId ? ` ${payload.productId}` : ""} from $${payload.oldPrice ?? "?"} to $${payload.newPrice ?? "?"} — notify interested customers`;
    case "back_in_stock":
      return `Product${payload.productId ? ` ${payload.productId}` : ""} back in stock — notify waitlist customers`;
    case "browse_abandon":
      return `Customer browsed product${payload.productId ? ` ${payload.productId}` : ""} but did not purchase — send browse abandonment email`;
    case "churn_risk_high":
      return `Customer churn risk elevated to ${payload.churnRisk ?? "high"} — initiate retention intervention`;
    default:
      return `Event ${eventType} detected — evaluating response`;
  }
}

eventReactorWorker.on("completed", (job) => {
  console.log(`[event-reactor] Job ${job.id} completed`);
});

eventReactorWorker.on("failed", (job, err) => {
  console.error(`[event-reactor] Job ${job?.id} failed:`, err.message);
});
