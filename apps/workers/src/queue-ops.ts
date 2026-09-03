import "dotenv/config";
import { Queue } from "bullmq";
import { redisConnection, QUEUE_NAMES } from "./config";
import type { DeadLetterRecord } from "./dead-letter";

async function main() {
  const [command, dlqId] = process.argv.slice(2);
  const dlq = new Queue<DeadLetterRecord>(QUEUE_NAMES.DEAD_LETTER, { connection: redisConnection });
  try {
    if (command === "list") {
      const jobs = await dlq.getJobs(["waiting", "delayed", "completed", "failed"], 0, 99, true);
      for (const job of jobs) {
        const r = job.data;
        console.log(JSON.stringify({ dlqId: job.id, queue: r.sourceQueue, jobId: r.sourceJobId, attempts: r.attemptsMade, reason: r.failedReason, failedAt: r.failedAt }));
      }
      return;
    }
    if (command !== "retry" || !dlqId) {
      throw new Error("Usage: tsx src/queue-ops.ts list | retry <dlq-id>");
    }
    if (process.env["QUEUE_REPLAY_CONFIRM"] !== dlqId) {
      throw new Error(`Set QUEUE_REPLAY_CONFIRM=${dlqId} to retry this exact job`);
    }
    const dlqJob = await dlq.getJob(dlqId);
    if (!dlqJob) throw new Error(`Dead-letter job not found: ${dlqId}`);
    const record = dlqJob.data;
    const source = new Queue(record.sourceQueue, { connection: redisConnection });
    try {
      const original = await source.getJob(record.sourceJobId);
      if (!original) throw new Error("Original failed job is no longer retained; refusing to reconstruct its payload");
      if ((await original.getState()) !== "failed") throw new Error("Original job is not failed; refusing duplicate execution");
      await original.retry();
      await dlqJob.remove();
      console.log(`Retried ${record.sourceQueue}/${record.sourceJobId}`);
    } finally {
      await source.close();
    }
  } finally {
    await dlq.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
