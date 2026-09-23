import { prisma, applyEmailProviderSafetyEffects } from "@allohq/database";
import { pollSesEventQueue, type NormalizedSesEvent } from "@allohq/messaging";
import { EventEmitter } from "node:events";
import { Queue } from "bullmq";
import { QUEUE_NAMES, redisConnection } from "../config";

const RECEIPT_RETENTION_DAYS = 30;
const RECEIPT_CLEANUP_BATCH = 1_000;
export const SES_SEND_RECONCILABLE_STATES = ["submitting", "ambiguous", "manual_review"] as const;
let customerStateQueue: Queue | null = null;

function stateQueue() {
  customerStateQueue ??= new Queue(QUEUE_NAMES.CUSTOMER_STATE, {
    connection: redisConnection,
  });
  return customerStateQueue;
}

async function persist(event: NormalizedSesEvent, _raw: string) {
  const db = prisma as any;
  const result = await db.$transaction(async (tx: any) => {
    // Retain only normalized operational fields; raw SNS payloads can contain
    // recipient addresses and are intentionally excluded from persistence.
    const inserted = await tx.sesEventReceipt.createMany({ data: [{ eventId: event.eventId, messageId: event.messageId, eventType: event.kind, payload: { kind: event.kind, occurredAt: event.occurredAt.toISOString(), deliveryTag: event.deliveryTag ?? null, permanent: event.permanent ?? null } }], skipDuplicates: true });
    if (!inserted.count) return { inserted: false, customerId: null, storeId: null };
    if (event.deliveryTag && event.kind === "send") {
      await tx.sesDeliveryAttempt.updateMany({ where: { providerTag: event.deliveryTag, state: { in: [...SES_SEND_RECONCILABLE_STATES] } }, data: { state: "accepted", externalId: event.messageId, reconciledAt: event.occurredAt } });
      const attempt = await tx.sesDeliveryAttempt.findUnique({ where: { providerTag: event.deliveryTag } });
      if (attempt) await tx.messageLog.updateMany({ where: { deliveryKey: attempt.deliveryKey, OR: [{ providerEventAt: null }, { providerEventAt: { lte: event.occurredAt } }] }, data: { status: "sent", provider: "ses", externalId: event.messageId, sentAt: event.occurredAt, providerEventAt: event.occurredAt, error: null } });
    }
    const log = await tx.messageLog.findFirst({ where: { externalId: event.messageId }, select: { id: true, status: true, providerEventAt: true, customerId: true, storeId: true } });
    const rank: Record<string, number> = { queued: 0, sent: 1, delivered: 2, opened: 3, clicked: 4, bounced: 5, failed: 5 };
    const next = event.kind === "delivery" ? "delivered" : event.kind === "open" ? "opened" : event.kind === "click" ? "clicked" : event.kind === "bounce" || event.kind === "complaint" ? "bounced" : event.kind === "reject" || event.kind === "rendering_failure" ? "failed" : null;
    if (log && next && (!log.providerEventAt || event.occurredAt >= log.providerEventAt) && (rank[next] ?? 0) >= (rank[log.status] ?? 0)) await tx.messageLog.update({ where: { id: log.id }, data: { ...(event.kind === "delivery" ? { status: next, deliveredAt: event.occurredAt } : event.kind === "open" ? { status: next, openedAt: event.occurredAt } : event.kind === "click" ? { status: next, clickedAt: event.occurredAt } : event.kind === "bounce" ? { status: next, error: event.permanent ? "permanent bounce" : "transient bounce" } : event.kind === "complaint" ? { status: next, error: "spam_complaint" } : { status: next, error: `SES ${event.kind}` }), providerEventAt: event.occurredAt } });
    return {
      inserted: true,
      customerId: log?.customerId ?? null,
      storeId: log?.storeId ?? null,
    };
  });
  if (
    result.inserted &&
    result.customerId &&
    result.storeId &&
    (event.kind === "open" || event.kind === "click")
  ) {
    await stateQueue().add(
      event.kind === "open" ? "email-opened" : "email-clicked",
      {
        type: event.kind === "open" ? "email_opened" : "email_clicked",
        customerId: result.customerId,
        storeId: result.storeId,
      },
      { jobId: `ses-state-${event.eventId}` }
    );
  }
  if (event.kind === "complaint" || (event.kind === "bounce" && event.permanent) || event.kind === "reject" || event.kind === "rendering_failure") {
    const log = await prisma.messageLog.findFirst({ where: { externalId: event.messageId }, select: { id: true } });
    if (log) await applyEmailProviderSafetyEffects(prisma, { messageLogId: log.id, event: event.kind === "complaint" ? "complaint" : event.kind === "bounce" ? "permanent_bounce" : "failure", provider: "ses", occurredAt: event.occurredAt });
  }
}

/**
 * Whether this worker reads SES delivery events, and why not when it doesn't.
 *
 * Tied to the event queue being configured, NOT to which provider carries new
 * traffic. It used to require EMAIL_PROVIDER=ses, so switching new sends back
 * to Resend stopped reading SES events at once, and the bounces and complaints
 * for SES mail already in flight went unrecorded: no suppression of those
 * recipients, no automatic hold or pause, no reconciliation of ambiguous sends.
 * A provider keeps producing events for days after it stops getting new mail.
 * (Resend's webhook was never tied to the selected provider.)
 *
 * The region must be explicit and match the queue. Without AWS_SES_REGION the
 * SQS client falls back to ap-south-1 and signs for the wrong region — for a
 * Stockholm (eu-north-1) queue, every poll would fail. That is reported as a
 * configuration problem rather than retried forever.
 */
export function sesEventConsumption(env: Record<string, string | undefined> = process.env): {
  consume: boolean;
  problem: string | null;
} {
  const queue = env["SES_EVENT_QUEUE_URL"]?.trim();
  if (!queue) return { consume: false, problem: null };
  const region = env["AWS_SES_REGION"]?.trim();
  if (!region) {
    return { consume: false, problem: "SES_EVENT_QUEUE_URL is set but AWS_SES_REGION is not; SES events cannot be read" };
  }
  const queueRegion = /^https:\/\/sqs\.([a-z0-9-]+)\.amazonaws\.com\//.exec(queue)?.[1];
  if (queueRegion && queueRegion !== region) {
    return { consume: false, problem: `SES_EVENT_QUEUE_URL is in ${queueRegion} but AWS_SES_REGION is ${region}; SES events cannot be read` };
  }
  return { consume: true, problem: null };
}

export function shouldConsumeSesEvents(env: Record<string, string | undefined> = process.env): boolean {
  return sesEventConsumption(env).consume;
}

export function startSesEventWorker() {
  const decision = sesEventConsumption();
  if (decision.problem) console.error(`[ses-events] ${decision.problem}`);
  if (!decision.consume) return null;
  let stopped = false;
  const events = new EventEmitter();
  const abortController = new AbortController();
  const report = (error: unknown) => events.emit("failed", undefined, error instanceof Error ? error : new Error(String(error)));
  const run = async () => { while (!stopped) { try { await pollSesEventQueue({ queueUrl: process.env["SES_EVENT_QUEUE_URL"]!, onEvent: persist, abortSignal: abortController.signal, onPoison: (error) => { console.error("[ses-events] message rejected; leaving it for SQS redrive/DLQ", error); report(error); } }); } catch (error) { if (stopped || (error as { name?: string }).name === "AbortError") break; console.error("[ses-events] poll failed", error); report(error); await new Promise((resolve) => setTimeout(resolve, 5_000)); } } };
  const runPromise = run();
  const reconciliationTimer = setInterval(() => { void flagStaleAmbiguousSesDeliveries().catch((error) => { console.error("[ses-events] reconciliation scan failed", error); report(error); }); }, 60_000);
  const retentionTimer = setInterval(() => { void cleanupSesEventReceipts().catch((error) => { console.error("[ses-events] retention cleanup failed", error); report(error); }); }, 6 * 60 * 60_000);
  return {
    name: "ses-events",
    on: (event: "failed", listener: (...args: any[]) => void) => events.on(event, listener),
    off: (event: "failed", listener: (...args: any[]) => void) => events.off(event, listener),
    close: async () => { stopped = true; clearInterval(reconciliationTimer); clearInterval(retentionTimer); abortController.abort(); await runPromise; },
  };
}

export async function cleanupSesEventReceipts(now = new Date(), db: any = prisma): Promise<number> {
  const expired = await db.sesEventReceipt.findMany({
    where: { receivedAt: { lt: new Date(now.getTime() - RECEIPT_RETENTION_DAYS * 86_400_000) } },
    select: { id: true },
    orderBy: { receivedAt: "asc" },
    take: RECEIPT_CLEANUP_BATCH,
  });
  if (!expired.length) return 0;
  const deleted = await db.sesEventReceipt.deleteMany({ where: { id: { in: expired.map((receipt: { id: string }) => receipt.id) } } });
  return deleted.count;
}

export async function flagStaleAmbiguousSesDeliveries(now = new Date()) {
  return (prisma as any).sesDeliveryAttempt.updateMany({ where: { state: "ambiguous", updatedAt: { lte: new Date(now.getTime() - 15 * 60_000) } }, data: { state: "manual_review", manualReviewAt: now } });
}
