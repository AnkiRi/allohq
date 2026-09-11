type DeliveryResult = { status: string; externalId?: string; error?: string; provider?: string; retryable?: boolean };
import { randomUUID } from "node:crypto";

/** Durable at-most-once guard. Ambiguous/submitting attempts await SES events. */
export async function withSesDeliveryAttempt<T extends DeliveryResult>(
  prisma: any,
  input: {
    enabled: boolean;
    deliveryKey: string;
    storeId: string;
    providerTag: string;
    acquireSubmissionLease?: () => Promise<{ release(): Promise<void> }>;
  },
  submit: () => Promise<T>,
): Promise<T> {
  if (!input.enabled) return submit();
  const ownerToken = randomUUID();
  let prior;
  try {
    await prisma.sesDeliveryAttempt.create({ data: { deliveryKey: input.deliveryKey, storeId: input.storeId, providerTag: input.providerTag, state: "submitting", ownerToken, submittedAt: new Date() } });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    prior = await prisma.sesDeliveryAttempt.findUnique({ where: { deliveryKey: input.deliveryKey } });
  }
  if (prior && ["submitting", "accepted", "ambiguous", "manual_review"].includes(prior.state)) {
    return { status: prior.state === "accepted" ? "sent" : "failed", externalId: prior.externalId ?? undefined, provider: "ses", retryable: false, error: prior.state === "accepted" ? undefined : `SES ${prior.state}: awaiting event reconciliation` } as T;
  }
  if (prior) {
    const claimed = await prisma.sesDeliveryAttempt.updateMany({ where: { deliveryKey: input.deliveryKey, state: { in: ["reserved", "failed"] } }, data: { state: "submitting", ownerToken, submittedAt: new Date(), lastError: null } });
    if (!claimed.count) return { status: "failed", provider: "ses", retryable: false, error: "SES attempt ownership changed; awaiting reconciliation" } as T;
  }
  const lease = await input.acquireSubmissionLease?.();
  let result: T;
  try {
    result = await submit();
  } finally {
    await lease?.release();
  }
  await prisma.sesDeliveryAttempt.updateMany({ where: { deliveryKey: input.deliveryKey, ownerToken }, data: result.status === "sent" ? { state: "accepted", externalId: result.externalId, reconciledAt: new Date() } : { state: result.error?.startsWith("SES_AMBIGUOUS") ? "ambiguous" : "failed", lastError: result.error } });
  return result;
}
