import { Queue } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";

const automationTriggerQueue = new Queue(QUEUE_NAMES.AUTOMATION_TRIGGER, { connection: redisConnection });

/**
 * Check for active automations with event triggers matching the given event,
 * then queue automation-trigger jobs for each match.
 * De-duplicates by checking if a MessageLog already exists for (automationId, customerId).
 */
export async function checkEventTriggers(storeId: string, eventName: string, customerId: string): Promise<void> {
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

      // De-duplicate: skip if already triggered for this (automation, customer)
      const existingLog = await prisma.messageLog.findFirst({
        where: { automationId: automation.id, customerId },
      });
      if (existingLog) {
        console.log(`[event-trigger] Skipping duplicate: automation ${automation.id} already triggered for customer ${customerId}`);
        continue;
      }

      await automationTriggerQueue.add(
        "automation-trigger",
        {
          automationId: automation.id,
          customerId,
          triggeredBy: eventName,
        },
        {
          // BullMQ jobId as secondary dedup guard
          jobId: `${automation.id}-${customerId}`,
        }
      );

      console.log(`[event-trigger] Queued automation ${automation.id} for customer ${customerId} (event: ${eventName})`);
    }
  } catch (err) {
    console.error(`[event-trigger] Error checking triggers for ${eventName}:`, (err as Error).message);
  }
}
