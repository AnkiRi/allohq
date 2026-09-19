import type { PrismaClient } from "@prisma/client";

export type ProviderSafetyEvent = "permanent_bounce" | "complaint" | "failure";

function tierCap(tier: number) {
  return 500 * 2 ** Math.min(Math.max(tier - 1, 0), 30);
}

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
  const pauseUpdate = pause
    ? await prisma.store.updateMany({ where: { id: message.storeId, emailSendingPausedAt: null }, data: { emailSendingPausedAt: input.occurredAt, emailSendingPauseReason: `Auto-paused for ${pause}: ${complaints} complaints, ${hardBounces} hard bounces, ${rejections} provider rejections across ${attempted} attempts in 7 days` } })
    : { count: 0 };
  const complaintRate = attempted ? complaints / attempted : 0;
  const bounceRate = attempted ? hardBounces / attempted : 0;
  if (complaintRate > 0.003) {
    const warmup = await prisma.sesWarmupState.upsert({ where: { storeId: message.storeId }, create: { storeId: message.storeId, startedAt: input.occurredAt, pausedAt: input.occurredAt, lastGrowthAt: input.occurredAt }, update: { pausedAt: input.occurredAt, lastGrowthAt: input.occurredAt } });
    await prisma.senderReputationAssessment.create({ data: { storeId: message.storeId, provider: input.provider, windowStartsAt: since, windowEndsAt: input.occurredAt, attempted, delivered: Math.max(0, attempted - hardBounces - rejections), bounced: hardBounces, complained: complaints, action: "pause", dailyCapBefore: tierCap(warmup.healthyDay), dailyCapAfter: tierCap(warmup.healthyDay), evidence: { automated: true, complaintRate, bounceRate, rejections, trigger: input.event } } });
    if (pauseUpdate.count > 0) {
      await prisma.agentObservation.create({
        data: {
          storeId: message.storeId,
          type: "sender_reputation_paused",
          severity: "critical",
          summary: `Email delivery was paused after ${complaints} complaints across ${attempted} attempts.`,
          data: { provider: input.provider, complaintRate, bounceRate, attempted },
          suggestedAction: {
            type: "review_sender_reputation",
            description: "Review consent, audience selection and recent creative before resuming.",
          },
        },
      });
    }
  } else if (complaintRate > 0.001 || bounceRate > 0.02) {
    const heldUntil = new Date(input.occurredAt.getTime() + 3 * 86_400_000);
    const warmup = await prisma.sesWarmupState.upsert({ where: { storeId: message.storeId }, create: { storeId: message.storeId, startedAt: input.occurredAt, heldUntil, lastGrowthAt: heldUntil }, update: { heldUntil, lastGrowthAt: heldUntil } });
    await prisma.senderReputationAssessment.create({ data: { storeId: message.storeId, provider: input.provider, windowStartsAt: since, windowEndsAt: input.occurredAt, attempted, delivered: Math.max(0, attempted - hardBounces - rejections), bounced: hardBounces, complained: complaints, action: "hold", dailyCapBefore: tierCap(warmup.healthyDay), dailyCapAfter: tierCap(warmup.healthyDay), evidence: { automated: true, complaintRate, bounceRate, rejections, trigger: input.event } } });
    const recentHold = await prisma.agentObservation.findFirst({
      where: {
        storeId: message.storeId,
        type: "sender_reputation_held",
        createdAt: { gte: new Date(input.occurredAt.getTime() - 24 * 60 * 60 * 1_000) },
      },
      select: { id: true },
    });
    if (!recentHold) {
      await prisma.agentObservation.create({
        data: {
          storeId: message.storeId,
          type: "sender_reputation_held",
          severity: "warning",
          summary: `Joon held the current email volume after recent delivery-health evidence.`,
          data: { provider: input.provider, complaintRate, bounceRate, attempted, heldUntil },
          suggestedAction: {
            type: "review_sender_reputation",
            description: "Inspect the 24-hour evidence before approving another volume tier.",
          },
        },
      });
    }
  }
}
