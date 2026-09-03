import { Worker, Queue } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";

const automationTriggerQueue = new Queue(QUEUE_NAMES.AUTOMATION_TRIGGER, { connection: redisConnection });

interface TriggerCheckJobData {
  type: "cron"; // Scheduled check
}

/**
 * Trigger Listener Worker
 * Periodically checks for automations that should fire based on:
 * - segment_entry: Customer enters a target segment
 * - segment_exit: Customer leaves a target segment
 * - schedule: Scheduled send time matches
 *
 * Event-based triggers (e.g., order_placed, customer_created) are handled
 * by the Shopify webhook worker which queues automation-trigger jobs directly.
 */
export const triggerListenerWorker = new Worker<TriggerCheckJobData>(
  QUEUE_NAMES.TRIGGER_CHECK,
  async (_job) => {
    console.log("[trigger-listener] Running trigger check");

    // Fetch all active automations
    const automations = await prisma.automation.findMany({
      where: { status: "active" },
    });

    for (const automation of automations) {
      const triggerConfig = automation.triggerConfig as Record<string, unknown>;

      switch (automation.triggerType) {
        case "segment_entry": {
          const segmentName = triggerConfig.segmentName as string;
          if (!segmentName) continue;

          // Find customers in the target segment who haven't been processed
          const segment = await prisma.customerSegment.findFirst({
            where: { storeId: automation.storeId, name: segmentName },
          });
          if (!segment) continue;

          // Find customers in this segment
          const customersInSegment = await prisma.customer.findMany({
            where: {
              storeId: automation.storeId,
              rfmScore: { segment: segmentName },
            },
            select: { id: true },
            take: 100,
          });

          // Check which customers already have been triggered for this automation
          const existingLogs = await prisma.messageLog.findMany({
            where: {
              automationId: automation.id,
              channel: "email", // Check for any channel
            },
            select: { metadata: true },
          });

          // Get set of customer IDs already processed (stored in first message per customer)
          const alreadyTriggered = new Set<string>();
          for (const log of existingLogs) {
            const meta = log.metadata as Record<string, unknown>;
            if (meta?.customerId) {
              alreadyTriggered.add(meta.customerId as string);
            }
          }

          // Queue new triggers for customers not yet processed
          let queued = 0;
          for (const customer of customersInSegment) {
            if (alreadyTriggered.has(customer.id)) continue;

            await automationTriggerQueue.add(
              "automation-trigger",
              {
                automationId: automation.id,
                customerId: customer.id,
                triggeredBy: `segment_entry:${segmentName}`,
              },
              {
                jobId: `${automation.id}-${customer.id}`, // Prevent duplicates
                attempts: 2,
              }
            );
            queued++;
          }

          if (queued > 0) {
            console.log(`[trigger-listener] Queued ${queued} triggers for automation "${automation.name}" (segment: ${segmentName})`);
          }
          break;
        }

        case "segment_exit": {
          const segmentName = triggerConfig.segmentName as string;
          if (!segmentName) continue;

          // Find customers who recently exited this segment (catch-up for missed real-time events)
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          const recentExits = await prisma.customerSegmentHistory.findMany({
            where: {
              storeId: automation.storeId,
              fromSegment: segmentName,
              changedAt: { gte: fiveMinutesAgo },
            },
            select: { customerId: true },
          });

          let queued = 0;
          for (const exit of recentExits) {
            const existing = await prisma.messageLog.findFirst({
              where: { automationId: automation.id, customerId: exit.customerId },
            });
            if (existing) continue;

            await automationTriggerQueue.add("automation-trigger", {
              automationId: automation.id,
              customerId: exit.customerId,
              triggeredBy: `segment_exit:${segmentName}`,
            }, {
              jobId: `${automation.id}-${exit.customerId}-exit`,
              attempts: 2,
            });
            queued++;
          }

          if (queued > 0) {
            console.log(`[trigger-listener] Queued ${queued} segment_exit triggers for "${automation.name}"`);
          }
          break;
        }

        case "schedule": {
          const schedule = triggerConfig.schedule as string;
          if (!schedule || schedule === "manual") continue;

          if (schedule === "daily" && triggerConfig.audience === "reorder_due") {
            const due = await prisma.customerProductRecommendation.findMany({
              where: { storeId: automation.storeId, strategy: "reorder", expiresAt: { gt: new Date() } },
              distinct: ["customerId"],
              select: { customerId: true },
              take: 1_000,
            });
            const day = new Date().toISOString().slice(0, 10);
            for (const candidate of due) {
              await automationTriggerQueue.add("automation-trigger", {
                automationId: automation.id,
                customerId: candidate.customerId,
                triggeredBy: `reorder_due:${day}`,
                eventInstanceId: `reorder_due:${candidate.customerId}:${day}`,
              }, { jobId: `${automation.id}-${candidate.customerId}-reorder-${day}`, attempts: 2 });
            }
            if (due.length > 0) console.log(`[trigger-listener] Queued ${due.length} evidence-backed replenishment triggers for "${automation.name}"`);
            continue;
          }

          // For scheduled automations, check if it's time to send
          // Parse cron-like schedule or specific datetime
          const scheduledAt = triggerConfig.scheduledAt as string;
          if (scheduledAt) {
            const targetTime = new Date(scheduledAt);
            const now = new Date();
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

            if (targetTime >= fiveMinutesAgo && targetTime <= now) {
              // Time to fire — get all customers for this store
              const customers = await prisma.customer.findMany({
                where: { storeId: automation.storeId, acceptsMarketing: true },
                select: { id: true },
                take: 1000,
              });

              for (const customer of customers) {
                await automationTriggerQueue.add(
                  "automation-trigger",
                  {
                    automationId: automation.id,
                    customerId: customer.id,
                    triggeredBy: `schedule:${scheduledAt}`,
                  },
                  {
                    jobId: `${automation.id}-${customer.id}-schedule`,
                    attempts: 2,
                  }
                );
              }

              console.log(`[trigger-listener] Queued ${customers.length} triggers for scheduled automation "${automation.name}"`);
            }
          }
          break;
        }

        case "event":
          // Event triggers are handled by webhooks (Shopify webhook worker)
          // No periodic check needed
          break;
      }
    }

    console.log("[trigger-listener] Trigger check complete");
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

triggerListenerWorker.on("completed", (job) => {
  console.log(`[trigger-listener] Job ${job.id} completed`);
});

triggerListenerWorker.on("failed", (job, err) => {
  console.error(`[trigger-listener] Job ${job?.id} failed:`, err.message);
});
