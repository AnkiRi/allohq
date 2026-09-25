import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, ownerStoreProcedure } from "../trpc";
import { assessSendingDay, createSenderDomain, getSenderDomain, growthEligibility, latestClosedSendingDay, requestSenderDomainVerification, selectedEmailProvider, warmupDailyCap, type SenderDomainProvider, type WarmupStanding } from "@allohq/messaging";
import { getStoreSenderIdentity, sendingDayEvidence } from "@allohq/database";
import { canReuseSenderDomain, conflictsWithConfiguredDomain } from "../lib/sender-domain-provider";

const domainSchema = z.string().trim().toLowerCase().regex(/^(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/);
function providerData(data: any) {
  return {
    externalId: String(data.id), status: String(data.status ?? "pending"),
    dnsRecords: Array.isArray(data.records) ? data.records : [], lastCheckedAt: new Date(),
    verifiedAt: data.status === "verified" ? new Date() : null, error: null,
  };
}

/**
 * Delivery health for the most recent SETTLED sending day.
 *
 * This used to read "the last 24 hours up to now", which judged today's sends
 * before their complaints could arrive — mailbox feedback loops take a day or
 * more — so a day could look healthy and justify growth before its bad news
 * existed. Counting a closed day by send date picks up late complaints, which
 * are written onto the original message rows.
 */
async function reputationWindow(prisma: any, storeId: string, provider: "resend" | "ses", now = new Date()) {
  const day = latestClosedSendingDay(now);
  const evidence = await sendingDayEvidence(prisma, { storeId, provider, startsAt: day.startsAt, endsAt: day.endsAt });
  const assessment = assessSendingDay(evidence, { closed: true });
  return {
    provider,
    windowStartsAt: day.startsAt,
    windowEndsAt: day.endsAt,
    ...evidence,
    bounceRate: evidence.attempted ? evidence.bounced / evidence.attempted : 0,
    complaintRate: evidence.delivered ? evidence.complained / evidence.delivered : 0,
    recommended: assessment.action,
    reason: assessment.reason,
    assessment,
  } as const;
}

/**
 * Fold the store's standing into the recommendation, so the screen never
 * offers "grow" for a tier the review would then refuse.
 */
function withGrowthEligibility(
  reputation: Awaited<ReturnType<typeof reputationWindow>>,
  warmup: WarmupStanding | null,
  now: Date,
) {
  const eligibility = growthEligibility({
    day: { startsAt: reputation.windowStartsAt },
    assessment: reputation.assessment,
    // No state yet means no send yet; a review would create it now.
    warmup: warmup ?? { healthyDay: 1, lastGrowthAt: now, heldUntil: null, pausedAt: null },
    now,
  });
  if (reputation.recommended !== "grow" || eligibility.eligible) {
    return { ...reputation, growthEligible: eligibility.eligible };
  }
  return { ...reputation, recommended: "hold" as const, reason: eligibility.reason, growthEligible: false };
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
      reputation: withGrowthEligibility(reputation, warmup, new Date()),
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
      if (input.action === "grow") {
        // Growth needs a settled healthy day at the CURRENT tier, no active
        // automated hold or pause, and a day whose evidence has not already
        // raised the tier. Before this, each click doubled the cap again on the
        // same evidence, and a review silently cleared an automated hold.
        const eligibility = growthEligibility({
          day: { startsAt: health.windowStartsAt },
          assessment: health.assessment,
          warmup: current,
          now,
        });
        if (!eligibility.eligible) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: eligibility.reason });
        }
      }
      const nextTier = input.action === "grow" ? Math.min(current.healthyDay + 1, 31) : current.healthyDay;
      const heldUntil = input.action === "hold" ? new Date(now.getTime() + 24 * 60 * 60 * 1_000) : null;
      const pausedAt = input.action === "pause" ? now : null;
      const capBefore = warmupDailyCap(current.healthyDay, Number.MAX_SAFE_INTEGER);
      const capAfter = warmupDailyCap(nextTier, Number.MAX_SAFE_INTEGER);
      const warmupData = {
        healthyDay: nextTier,
        lastGrowthAt: now,
        heldUntil,
        pausedAt,
        overrideReason: input.reason,
        overrideRecordedAt: now,
      };
      const assessment = await ctx.prisma.$transaction(async (tx) => {
        if (input.action === "grow") {
          // Claim the tier that was just judged. Two reviews landing together
          // would otherwise both read tier N and both write N+1, and a later
          // write could build on a tier it never evaluated.
          const claimed = await tx.sesWarmupState.updateMany({
            where: { storeId: input.storeId, healthyDay: current.healthyDay, lastGrowthAt: current.lastGrowthAt },
            data: warmupData,
          });
          if (claimed.count !== 1) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "The volume tier changed while this review was being recorded. Reload and review again.",
            });
          }
        } else {
          await tx.sesWarmupState.update({ where: { storeId: input.storeId }, data: warmupData });
        }
        const created = await tx.senderReputationAssessment.create({
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
              kind: "closed_day",
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
        });
        await tx.agentObservation.create({
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
        });
        if (input.action === "pause") {
          await tx.store.update({
            where: { id: input.storeId },
            data: {
              emailSendingPausedAt: now,
              emailSendingPauseReason: `Warm-up review pause: ${input.reason}`,
            },
          });
        } else {
          await tx.store.updateMany({
            where: {
              id: input.storeId,
              emailSendingPauseReason: { startsWith: "Warm-up review pause:" },
            },
            data: { emailSendingPausedAt: null, emailSendingPauseReason: null },
          });
        }
        return created;
      });
      return { assessment, nextTier, dailyCap: capAfter };
    }),
});
