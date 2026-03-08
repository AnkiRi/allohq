import { Worker, Queue } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";

const automationTriggerQueue = new Queue(QUEUE_NAMES.AUTOMATION_TRIGGER, { connection: redisConnection });

interface SegmentChangeJobData {
  storeId: string;
  customerId: string;
  fromSegment: string;
  toSegment: string;
}

/**
 * Segment Change Worker
 * Processes segment transitions detected by the RFM worker.
 * Matches segment_exit and segment_entry automations, queues triggers with dedup.
 */
export const segmentChangeWorker = new Worker<SegmentChangeJobData>(
  QUEUE_NAMES.SEGMENT_CHANGE,
  async (job) => {
    const { storeId, customerId, fromSegment, toSegment } = job.data;

    // Find active automations triggered by segment_exit for the fromSegment
    const exitAutomations = await prisma.automation.findMany({
      where: { storeId, status: "active", triggerType: "segment_exit" },
    });

    for (const automation of exitAutomations) {
      const config = automation.triggerConfig as { segmentName?: string };
      if (config.segmentName !== fromSegment) continue;

      // Dedup check
      const existing = await prisma.messageLog.findFirst({
        where: { automationId: automation.id, customerId },
      });
      if (existing) continue;

      await automationTriggerQueue.add("automation-trigger", {
        automationId: automation.id,
        customerId,
        triggeredBy: `segment_exit:${fromSegment}`,
      }, {
        jobId: `${automation.id}-${customerId}-exit`,
      });

      console.log(`[segment-change] Queued segment_exit trigger: automation ${automation.id}, customer ${customerId}, left "${fromSegment}"`);
    }

    // Find active automations triggered by segment_entry for the toSegment
    const entryAutomations = await prisma.automation.findMany({
      where: { storeId, status: "active", triggerType: "segment_entry" },
    });

    for (const automation of entryAutomations) {
      const config = automation.triggerConfig as { segmentName?: string };
      if (config.segmentName !== toSegment) continue;

      const existing = await prisma.messageLog.findFirst({
        where: { automationId: automation.id, customerId },
      });
      if (existing) continue;

      await automationTriggerQueue.add("automation-trigger", {
        automationId: automation.id,
        customerId,
        triggeredBy: `segment_entry:${toSegment}`,
      }, {
        jobId: `${automation.id}-${customerId}-entry`,
      });

      console.log(`[segment-change] Queued segment_entry trigger: automation ${automation.id}, customer ${customerId}, entered "${toSegment}"`);
    }
  },
  { connection: redisConnection, concurrency: 5 }
);

segmentChangeWorker.on("completed", (job) => {
  console.log(`[segment-change] Job ${job.id} completed`);
});

segmentChangeWorker.on("failed", (job, err) => {
  console.error(`[segment-change] Job ${job?.id} failed:`, err.message);
});
