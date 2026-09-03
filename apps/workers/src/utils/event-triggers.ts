import { Queue } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";
import { eventTriggerJobId } from "./event-trigger-id";

const automationTriggerQueue = new Queue(QUEUE_NAMES.AUTOMATION_TRIGGER, { connection: redisConnection });

/**
 * Check for active automations with event triggers matching the given event,
 * then queue automation-trigger jobs for each match.
 * De-duplicates one Shopify/customer event, while still allowing a customer to
 * enter the same repeatable journey again after a later purchase or checkout.
 */
export async function checkEventTriggers(
  storeId: string,
  eventName: string,
  customerId: string,
  eventInstanceId?: string,
): Promise<void> {
  try {
    const automations = await prisma.automation.findMany({
      where: {
        storeId,
        status: "active",
        triggerType: "event",
      },
    });

    for (const automation of automations) {
      const triggerConfig = automation.triggerConfig as { event?: string } | null;
      if (triggerConfig?.event !== eventName) continue;

      const instance = eventInstanceId ?? `${eventName}-${new Date().toISOString().slice(0, 10)}`;
      await automationTriggerQueue.add(
        "automation-trigger",
        {
          automationId: automation.id,
          customerId,
          triggeredBy: eventName,
          eventInstanceId: instance,
        },
        {
          // BullMQ jobId as secondary dedup guard
          jobId: eventTriggerJobId(automation.id, customerId, instance),
        }
      );

      console.log(`[event-trigger] Queued automation ${automation.id} for customer ${customerId} (event: ${eventName})`);
    }
  } catch (err) {
    console.error(`[event-trigger] Error checking triggers for ${eventName}:`, (err as Error).message);
  }
}
