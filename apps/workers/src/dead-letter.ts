import { Queue, QueueEvents } from "bullmq";
import { redisConnection, QUEUE_NAMES } from "./config";

export const CRITICAL_QUEUE_NAMES = [
  QUEUE_NAMES.EMAIL_SEND,
  QUEUE_NAMES.AUTOMATION_TRIGGER,
  QUEUE_NAMES.SHOPIFY_WEBHOOK,
] as const;

export interface DeadLetterRecord {
  sourceQueue: string;
  sourceJobId: string;
  sourceJobName: string;
  attemptsMade: number;
  failedReason: string;
  data: unknown;
  failedAt: string;
}

export function deadLetterJobId(record: Pick<DeadLetterRecord, "sourceQueue" | "sourceJobId" | "attemptsMade">): string {
  return `${record.sourceQueue}-${record.sourceJobId}-${record.attemptsMade}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function startCriticalDeadLetterCapture() {
  const deadLetterQueue = new Queue<DeadLetterRecord>(QUEUE_NAMES.DEAD_LETTER, {
    connection: redisConnection,
  });
  const queues = CRITICAL_QUEUE_NAMES.map((name) => new Queue(name, { connection: redisConnection }));
  const events = queues.map((sourceQueue) => {
    const queueEvents = new QueueEvents(sourceQueue.name, { connection: redisConnection });
    queueEvents.on("failed", async ({ jobId, failedReason }) => {
      try {
        const job = await sourceQueue.getJob(jobId);
        if (!job) return;
        // A failed event can also be emitted before BullMQ schedules a retry.
        // Capture only jobs that actually remain in the terminal failed set;
        // this also recognizes UnrecoverableError on its first attempt.
        if ((await job.getState()) !== "failed") return;
        const record: DeadLetterRecord = {
          sourceQueue: sourceQueue.name,
          sourceJobId: String(job.id),
          sourceJobName: job.name,
          attemptsMade: job.attemptsMade,
          failedReason,
          data: job.data,
          failedAt: new Date().toISOString(),
        };
        await deadLetterQueue.add("failed-job", record, {
          jobId: deadLetterJobId(record),
          removeOnComplete: false,
          removeOnFail: false,
        });
        console.error(`[dlq] ${sourceQueue.name}/${jobId}: ${failedReason}`);
      } catch (error) {
        console.error(`[dlq] failed to record ${sourceQueue.name}/${jobId}:`, error);
      }
    });
    return queueEvents;
  });

  return {
    close: async () => {
      await Promise.all([...events.map((event) => event.close()), ...queues.map((queue) => queue.close()), deadLetterQueue.close()]);
    },
  };
}
