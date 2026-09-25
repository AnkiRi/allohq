import { prisma as defaultPrisma } from "@allohq/database";
import type { Queue } from "bullmq";

/**
 * Re-drive planned deliveries that nothing is left to send.
 *
 * The planner writes each delivery chunk to `campaign_delivery_chunks` before
 * it queues the chunk's job. A chunk whose job failed for good, or vanished
 * from Redis, would otherwise leave its recipients unsent forever: there was no
 * other record of them. This sweep finds planned chunks that are past their
 * delivery time (plus a grace period), not complete, and not owned by a pending
 * job, and queues them again under a new job id.
 *
 * Safe to run at any time and as often as wanted: a chunk with a pending job
 * is left alone, and deliveries are idempotent by delivery key, so a re-driven
 * delivery that already went out is skipped (and the provider's idempotency key
 * returns the original message rather than sending twice).
 */
const PENDING = new Set(["waiting", "delayed", "active", "prioritized", "waiting-children"]);
/** A chunk re-driven this many times stops being retried and stays alerted. */
export const MAX_RECOVERIES = 5;

export async function recoverStrandedDeliveries(input: {
  queue: Queue;
  prisma?: any;
  now?: Date;
  graceMs?: number;
  limit?: number;
}) {
  const prisma = input.prisma ?? defaultPrisma;
  const now = input.now ?? new Date();
  const graceMs = input.graceMs ?? Number(process.env["DELIVERY_RECOVERY_GRACE_MS"] ?? 15 * 60_000);
  const rows = await prisma.campaignDeliveryChunk.findMany({
    where: { completedAt: null, deliverAt: { lt: new Date(now.getTime() - graceMs) } },
    orderBy: { deliverAt: "asc" },
    take: input.limit ?? 200,
  });

  const summary = { checked: rows.length, owned: 0, recovered: 0, gaveUp: 0 };
  for (const row of rows) {
    const current = row.recoveryJobId ?? row.jobId;
    const job = await input.queue.getJob(current);
    const state = job ? await job.getState() : "missing";
    if (PENDING.has(state)) {
      summary.owned += 1;
      continue;
    }
    // Completed but never marked (the worker stopped between finishing and
    // recording it) is re-driven too: every finished delivery is skipped, so
    // the re-run only records the completion.
    if (row.recoveryCount >= MAX_RECOVERIES) {
      summary.gaveUp += 1;
      console.error(
        `[delivery] ALERT recovery gave up: campaign=${row.campaignId} chunk=${row.jobId} ` +
          `after ${row.recoveryCount} re-drives; last error: ${row.lastError ?? "none recorded"}`,
      );
      continue;
    }
    const recoveryJobId = `${row.jobId}-recovery-${row.recoveryCount + 1}`;
    await input.queue.add(
      "deliver-chunk",
      { deliverChunk: true, campaignId: row.campaignId, deliveries: row.deliveries, planJobId: row.jobId },
      {
        jobId: recoveryJobId,
        attempts: 5,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 10_000 },
      },
    );
    await prisma.campaignDeliveryChunk.update({
      where: { id: row.id },
      data: { recoveryJobId, recoveryCount: { increment: 1 }, recoveredAt: now },
    });
    summary.recovered += 1;
    console.warn(`[delivery] re-driving chunk ${row.jobId} of campaign ${row.campaignId} (${state}) as ${recoveryJobId}`);
  }
  return summary;
}
