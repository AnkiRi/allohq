import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, ownerStoreProcedure } from "../trpc";
import { createSenderDomain, getSenderDomain, requestSenderDomainVerification, selectedEmailProvider, warmupDailyCap, warmupHealthAction, type SenderDomainProvider } from "@allohq/messaging";
import { getStoreSenderIdentity } from "@allohq/database";
import { canReuseSenderDomain, conflictsWithConfiguredDomain } from "../lib/sender-domain-provider";

const domainSchema = z.string().trim().toLowerCase().regex(/^(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/);
function providerData(data: any) {
  return {
    externalId: String(data.id), status: String(data.status ?? "pending"),
    dnsRecords: Array.isArray(data.records) ? data.records : [], lastCheckedAt: new Date(),
    verifiedAt: data.status === "verified" ? new Date() : null, error: null,
  };
}

async function reputationWindow(prisma: any, storeId: string, provider: "resend" | "ses", now = new Date()) {
  const windowStartsAt = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  const where = { storeId, provider, sentAt: { gte: windowStartsAt } };
  const [attempted, delivered, bounced, complained] = await Promise.all([
    prisma.messageLog.count({ where }),
    prisma.messageLog.count({ where: { ...where, status: { in: ["delivered", "opened", "clicked"] } } }),
    prisma.messageLog.count({ where: { ...where, status: "bounced" } }),
    prisma.messageLog.count({ where: { ...where, error: "spam_complaint" } }),
  ]);
  const recommended = attempted < 100
    ? "hold"
    : warmupHealthAction({ delivered, bounced, complained });
  return {
    provider,
    windowStartsAt,
    windowEndsAt: now,
    attempted,
    delivered,
    bounced,
    complained,
    bounceRate: attempted ? bounced / attempted : 0,
    complaintRate: delivered ? complained / delivered : 0,
    recommended,
    reason: attempted < 100
      ? `Hold until at least 100 delivery attempts provide enough evidence (${attempted} so far).`
      : recommended === "grow"
        ? "Delivery health is inside Joon's conservative bounce and complaint thresholds."
        : recommended === "pause"
          ? "Complaint rate is above the safety threshold; pause and review the audience and copy."
          : "Bounce or complaint evidence requires holding the current volume tier.",
  } as const;
}

export const senderDomainsRouter = router({
  get: ownerStoreProcedure.query(async ({ ctx, input }) => {
    const provider = selectedEmailProvider();
    const [domain, warmup, reputation, assessments] = await Promise.all([
      getStoreSenderIdentity(input.storeId, selectedEmailProvider()),
      ctx.prisma.sesWarmupState.findUnique({ where: { storeId: input.storeId } }),
      reputationWindow(ctx.prisma, input.storeId, provider),
      ctx.prisma.senderReputationAssessment.findMany({
        where: { storeId: input.storeId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);
    return domain ? {
      ...domain,
      warmup,
      reputation,
      assessments,
      currentDailyCap: warmupDailyCap(warmup?.healthyDay ?? 1, Number.MAX_SAFE_INTEGER),
    } : null;
  }),
  configure: ownerStoreProcedure.input(z.object({ domain: domainSchema })).mutation(async ({ ctx, input }) => {
    const providerName = selectedEmailProvider();
    const existing = await getStoreSenderIdentity(input.storeId, providerName);
    if (canReuseSenderDomain(existing, input.domain, providerName)) return existing;
    if (conflictsWithConfiguredDomain(existing, input.domain)) throw new TRPCError({ code: "CONFLICT", message: "A different provider domain is already configured" });
    const provider = await createSenderDomain(input.domain, input.storeId);
    return ctx.prisma.$transaction(async (tx) => {
      const identity = await tx.senderProviderIdentity.upsert({
        where: { storeId_provider: { storeId: input.storeId, provider: providerName } },
        create: { storeId: input.storeId, domain: input.domain, provider: providerName, ...providerData(provider) },
        update: { domain: input.domain, ...providerData(provider) },
      });
      // Preserve the legacy Resend projection for existing operational views.
      // SES provisioning must never overwrite it; both identities coexist.
      if (providerName === "resend") {
        await tx.senderDomain.upsert({
          where: { storeId: input.storeId },
          create: { storeId: input.storeId, domain: input.domain, provider: providerName, ...providerData(provider) },
          update: { domain: input.domain, provider: providerName, ...providerData(provider) },
        });
      }
      return identity;
    });
  }),
  refresh: ownerStoreProcedure.mutation(async ({ ctx, input }) => {
    const existing = await getStoreSenderIdentity(input.storeId, selectedEmailProvider());
    if (!existing?.externalId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure a sender domain first" });
    const provider = await getSenderDomain(existing.externalId, existing.provider as SenderDomainProvider);
    const next = await ctx.prisma.senderProviderIdentity.upsert({
      where: { storeId_provider: { storeId: input.storeId, provider: existing.provider } },
      create: { storeId: input.storeId, domain: existing.domain, provider: existing.provider, ...providerData(provider) },
      update: providerData(provider),
    });
    if (existing.provider === "resend") await ctx.prisma.senderDomain.updateMany({ where: { storeId: input.storeId, provider: "resend" }, data: providerData(provider) });
    return next;
  }),
  verify: ownerStoreProcedure.mutation(async ({ ctx, input }) => {
    const existing = await getStoreSenderIdentity(input.storeId, selectedEmailProvider());
    if (!existing?.externalId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure a sender domain first" });
    await requestSenderDomainVerification(existing.externalId, existing.provider as SenderDomainProvider);
    const data = { status: "pending", error: null, lastCheckedAt: new Date() };
    const next = await ctx.prisma.senderProviderIdentity.upsert({
      where: { storeId_provider: { storeId: input.storeId, provider: existing.provider } },
      create: { storeId: input.storeId, domain: existing.domain, provider: existing.provider, externalId: existing.externalId, ...data },
      update: data,
    });
    if (existing.provider === "resend") await ctx.prisma.senderDomain.updateMany({ where: { storeId: input.storeId, provider: "resend" }, data });
    return next;
  }),
  overrideWarmup: ownerStoreProcedure.input(z.object({ reason: z.string().trim().min(12).max(500) })).mutation(async ({ ctx, input }) => {
    const now = new Date();
    return ctx.prisma.sesWarmupState.upsert({ where: { storeId: input.storeId }, create: { storeId: input.storeId, startedAt: now, overrideReason: input.reason, overrideRecordedAt: now }, update: { pausedAt: null, heldUntil: null, overrideReason: input.reason, overrideRecordedAt: now } });
  }),
  reviewWarmup: ownerStoreProcedure
    .input(z.object({
      action: z.enum(["grow", "hold", "pause"]),
      reason: z.string().trim().min(12).max(500),
      rollbackCondition: z.string().trim().min(12).max(500),
      reviewAfterHours: z.number().int().min(1).max(168).default(24),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const provider = selectedEmailProvider();
      const [health, current] = await Promise.all([
        reputationWindow(ctx.prisma, input.storeId, provider, now),
        ctx.prisma.sesWarmupState.upsert({
          where: { storeId: input.storeId },
          create: { storeId: input.storeId, startedAt: now },
          update: {},
        }),
      ]);
      if (input.action === "grow" && health.recommended !== "grow") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: health.reason,
        });
      }
      const nextTier = input.action === "grow" ? Math.min(current.healthyDay + 1, 31) : current.healthyDay;
      const heldUntil = input.action === "hold" ? new Date(now.getTime() + 24 * 60 * 60 * 1_000) : null;
      const pausedAt = input.action === "pause" ? now : null;
      const capBefore = warmupDailyCap(current.healthyDay, Number.MAX_SAFE_INTEGER);
      const capAfter = warmupDailyCap(nextTier, Number.MAX_SAFE_INTEGER);
      const [, assessment] = await ctx.prisma.$transaction([
        ctx.prisma.sesWarmupState.update({
          where: { storeId: input.storeId },
          data: {
            healthyDay: nextTier,
            lastGrowthAt: now,
            heldUntil,
            pausedAt,
            overrideReason: input.reason,
            overrideRecordedAt: now,
          },
        }),
        ctx.prisma.senderReputationAssessment.create({
          data: {
            storeId: input.storeId,
            provider,
            windowStartsAt: health.windowStartsAt,
            windowEndsAt: health.windowEndsAt,
            attempted: health.attempted,
            delivered: health.delivered,
            bounced: health.bounced,
            complained: health.complained,
            action: input.action,
            dailyCapBefore: capBefore,
            dailyCapAfter: capAfter,
            evidence: {
              recommended: health.recommended,
              bounceRate: health.bounceRate,
              complaintRate: health.complaintRate,
              explanation: health.reason,
            },
            reviewedBy: ctx.userId,
            reviewReason: input.reason,
            reviewedAt: now,
            nextReviewAt: new Date(now.getTime() + input.reviewAfterHours * 60 * 60 * 1_000),
            rollbackCondition: input.rollbackCondition,
          },
        }),
        ctx.prisma.agentObservation.create({
          data: {
            storeId: input.storeId,
            type: `sender_reputation_${input.action}`,
            severity: input.action === "pause" ? "critical" : input.action === "hold" ? "warning" : "info",
            summary:
              input.action === "grow"
                ? `Reviewed sending cap increased to ${capAfter.toLocaleString("en-IN")} messages per day.`
                : input.action === "hold"
                  ? `Sending volume remains at ${capAfter.toLocaleString("en-IN")} messages per day pending more evidence.`
                  : "Email delivery was paused after a reputation review.",
            data: {
              provider,
              dailyCapBefore: capBefore,
              dailyCapAfter: capAfter,
              nextReviewAt: new Date(now.getTime() + input.reviewAfterHours * 60 * 60 * 1_000),
              rollbackCondition: input.rollbackCondition,
            },
            suggestedAction: {
              type: "review_sender_reputation",
              description: input.rollbackCondition,
            },
          },
        }),
        input.action === "pause"
          ? ctx.prisma.store.update({
              where: { id: input.storeId },
              data: {
                emailSendingPausedAt: now,
                emailSendingPauseReason: `Warm-up review pause: ${input.reason}`,
              },
            })
          : ctx.prisma.store.updateMany({
              where: {
                id: input.storeId,
                emailSendingPauseReason: { startsWith: "Warm-up review pause:" },
              },
              data: { emailSendingPausedAt: null, emailSendingPauseReason: null },
            }),
      ]);
      return { assessment, nextTier, dailyCap: capAfter };
    }),
});
