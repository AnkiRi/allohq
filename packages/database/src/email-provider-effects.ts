import type { PrismaClient } from "@prisma/client";

export type ProviderSafetyEvent = "permanent_bounce" | "complaint" | "failure";

export function deliverabilityPauseReason(window: { complaints: number; hardBounces: number; rejections: number; attempted: number }) {
  const { complaints, rejections, attempted } = window;
  if (attempted > 0 && complaints / attempted > 0.003) return "complaints";
  if (rejections >= 5 || (attempted >= 100 && rejections / attempted >= 0.02)) return "provider_rejections";
  return null;
}

export async function applyEmailProviderSafetyEffects(prisma: PrismaClient, input: { messageLogId: string; event: ProviderSafetyEvent; provider: "resend" | "ses"; occurredAt: Date }) {
  const message = await prisma.messageLog.findUnique({ where: { id: input.messageLogId }, select: { customerId: true, storeId: true } });
  if (!message) return;
  if (message.customerId && (input.event === "permanent_bounce" || input.event === "complaint")) {
    const reason = input.event === "complaint" ? "complaint" : "hard_bounce";
    await prisma.$transaction([
      prisma.contactSuppression.upsert({ where: { customerId_channel: { customerId: message.customerId, channel: "email" } }, create: { storeId: message.storeId, customerId: message.customerId, channel: "email", reason, source: input.provider }, update: { reason, source: input.provider, expiresAt: null } }),
      prisma.contactConsent.upsert({ where: { customerId_channel: { customerId: message.customerId, channel: "email" } }, create: { storeId: message.storeId, customerId: message.customerId, channel: "email", status: "opted_out", source: "provider", revokedAt: input.occurredAt }, update: { status: "opted_out", source: "provider", revokedAt: input.occurredAt } }),
      prisma.customer.update({ where: { id: message.customerId }, data: { acceptsMarketing: false } }),
    ]);
  }
  const since = new Date(input.occurredAt.getTime() - 7 * 86_400_000);
  const [complaints, hardBounces, rejections, attempted] = await Promise.all([
    prisma.messageLog.count({ where: { storeId: message.storeId, sentAt: { gte: since }, error: "spam_complaint" } }),
    prisma.messageLog.count({ where: { storeId: message.storeId, sentAt: { gte: since }, status: "bounced", OR: [{ error: { contains: "hard", mode: "insensitive" } }, { error: { contains: "permanent", mode: "insensitive" } }, { error: "bounced" }] } }),
    prisma.messageLog.count({ where: { storeId: message.storeId, sentAt: { gte: since }, status: "failed" } }),
    prisma.messageLog.count({ where: { storeId: message.storeId, sentAt: { gte: since }, status: { in: ["sent", "delivered", "opened", "clicked", "bounced", "failed"] } } }),
  ]);
  const pause = deliverabilityPauseReason({ complaints, hardBounces, rejections, attempted });
  if (pause) await prisma.store.updateMany({ where: { id: message.storeId, emailSendingPausedAt: null }, data: { emailSendingPausedAt: input.occurredAt, emailSendingPauseReason: `Auto-paused for ${pause}: ${complaints} complaints, ${hardBounces} hard bounces, ${rejections} provider rejections across ${attempted} attempts in 7 days` } });
  const complaintRate = attempted ? complaints / attempted : 0;
  const bounceRate = attempted ? hardBounces / attempted : 0;
  if (complaintRate > 0.003) {
    await prisma.sesWarmupState.updateMany({ where: { storeId: message.storeId }, data: { pausedAt: input.occurredAt, lastGrowthAt: input.occurredAt } });
  } else if (complaintRate > 0.001 || bounceRate > 0.02) {
    const heldUntil = new Date(input.occurredAt.getTime() + 3 * 86_400_000);
    await prisma.sesWarmupState.updateMany({ where: { storeId: message.storeId }, data: { heldUntil, lastGrowthAt: heldUntil } });
  }
}
