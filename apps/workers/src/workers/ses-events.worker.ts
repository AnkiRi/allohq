import { prisma, applyEmailProviderSafetyEffects } from "@allohq/database";
import { pollSesEventQueue, type NormalizedSesEvent } from "@allohq/messaging";
import { EventEmitter } from "node:events";

const RECEIPT_RETENTION_DAYS = 30;
const RECEIPT_CLEANUP_BATCH = 1_000;
export const SES_SEND_RECONCILABLE_STATES = ["submitting", "ambiguous", "manual_review"] as const;

async function persist(event: NormalizedSesEvent, _raw: string) {
  const db = prisma as any;
  await db.$transaction(async (tx: any) => {
    // Retain only normalized operational fields; raw SNS payloads can contain
    // recipient addresses and are intentionally excluded from persistence.
    const inserted = await tx.sesEventReceipt.createMany({ data: [{ eventId: event.eventId, messageId: event.messageId, eventType: event.kind, payload: { kind: event.kind, occurredAt: event.occurredAt.toISOString(), deliveryTag: event.deliveryTag ?? null, permanent: event.permanent ?? null } }], skipDuplicates: true });
    if (!inserted.count) return;
    if (event.deliveryTag && event.kind === "send") {
      await tx.sesDeliveryAttempt.updateMany({ where: { providerTag: event.deliveryTag, state: { in: [...SES_SEND_RECONCILABLE_STATES] } }, data: { state: "accepted", externalId: event.messageId, reconciledAt: event.occurredAt } });
      const attempt = await tx.sesDeliveryAttempt.findUnique({ where: { providerTag: event.deliveryTag } });
      if (attempt) await tx.messageLog.updateMany({ where: { deliveryKey: attempt.deliveryKey, OR: [{ providerEventAt: null }, { providerEventAt: { lte: event.occurredAt } }] }, data: { status: "sent", provider: "ses", externalId: event.messageId, sentAt: event.occurredAt, providerEventAt: event.occurredAt, error: null } });
    }
    const log = await tx.messageLog.findFirst({ where: { externalId: event.messageId }, select: { id: true, status: true, providerEventAt: true } });
    const rank: Record<string, number> = { queued: 0, sent: 1, delivered: 2, opened: 3, clicked: 4, bounced: 5, failed: 5 };
    const next = event.kind === "delivery" ? "delivered" : event.kind === "open" ? "opened" : event.kind === "click" ? "clicked" : event.kind === "bounce" || event.kind === "complaint" ? "bounced" : event.kind === "reject" || event.kind === "rendering_failure" ? "failed" : null;
    if (log && next && (!log.providerEventAt || event.occurredAt >= log.providerEventAt) && (rank[next] ?? 0) >= (rank[log.status] ?? 0)) await tx.messageLog.update({ where: { id: log.id }, data: { ...(event.kind === "delivery" ? { status: next, deliveredAt: event.occurredAt } : event.kind === "open" ? { status: next, openedAt: event.occurredAt } : event.kind === "click" ? { status: next, clickedAt: event.occurredAt } : event.kind === "bounce" ? { status: next, error: event.permanent ? "permanent bounce" : "transient bounce" } : event.kind === "complaint" ? { status: next, error: "spam_complaint" } : { status: next, error: `SES ${event.kind}` }), providerEventAt: event.occurredAt } });
  });
  if (event.kind === "complaint" || (event.kind === "bounce" && event.permanent) || event.kind === "reject" || event.kind === "rendering_failure") {
    const log = await prisma.messageLog.findFirst({ where: { externalId: event.messageId }, select: { id: true } });
    if (log) await applyEmailProviderSafetyEffects(prisma, { messageLogId: log.id, event: event.kind === "complaint" ? "complaint" : event.kind === "bounce" ? "permanent_bounce" : "failure", provider: "ses", occurredAt: event.occurredAt });
  }
}

export function startSesEventWorker() {
  if (process.env["EMAIL_PROVIDER"] !== "ses" || !process.env["SES_EVENT_QUEUE_URL"]) return null;
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
