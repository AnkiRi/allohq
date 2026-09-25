import { prisma as defaultPrisma, sendingDayEvidence, storesThatSent } from "@allohq/database";
import {
  EVIDENCE_SETTLE_HOURS,
  assessSendingDay,
  growthEligibility,
  latestClosedSendingDay,
  warmupDailyCap,
} from "@allohq/messaging";

/**
 * Reconcile each store's most recent settled sending day into a recommendation.
 *
 * The ramp used to grow only when someone happened to open the review screen
 * and ask; nothing looked at a finished day on its own. This records, once per
 * store, provider and settled day, what that day's evidence supports — and
 * tells the owner when it supports growth.
 *
 * It RECOMMENDS; it never changes the tier. Growth stays a reviewed action with
 * a reason and a rollback condition. Tightening needs no recommendation at all:
 * holds and pauses are applied the moment bounce and complaint events arrive
 * (`applyEmailProviderSafetyEffects`), so this job is never on that path.
 *
 * Provider-neutral: Resend and SES are judged by one policy, and a day's
 * evidence belongs to the provider that carried it.
 */
export const CLOSED_DAY_RECOMMENDATION = "closed_day_recommendation";

export async function reconcileClosedSendingDays(input: { prisma?: any; now?: Date } = {}) {
  const prisma = input.prisma ?? defaultPrisma;
  const now = input.now ?? new Date();
  const day = latestClosedSendingDay(now);
  const senders = await storesThatSent(prisma, day);

  let recorded = 0;
  let alreadyRecorded = 0;
  let growthReady = 0;
  for (const { storeId, provider } of senders) {
    // One recommendation per store, provider and day. The schedule runs once a
    // day under a stable id, and this check makes a rerun — or a manual one —
    // a no-op rather than a duplicate.
    const existing = await prisma.senderReputationAssessment.findFirst({
      where: {
        storeId,
        provider,
        windowStartsAt: day.startsAt,
        evidence: { path: ["kind"], equals: CLOSED_DAY_RECOMMENDATION },
      },
      select: { id: true },
    });
    if (existing) {
      alreadyRecorded += 1;
      continue;
    }

    const evidence = await sendingDayEvidence(prisma, { storeId, provider, ...day });
    const assessment = assessSendingDay(evidence, { closed: true });
    const warmup = await prisma.sesWarmupState.findUnique({ where: { storeId } });
    const standing = warmup ?? { healthyDay: 1, lastGrowthAt: now, heldUntil: null, pausedAt: null };
    const eligibility = growthEligibility({ day, assessment, warmup: standing, now });
    const capBefore = warmupDailyCap(standing.healthyDay, Number.MAX_SAFE_INTEGER);
    const capAfter = eligibility.eligible
      ? warmupDailyCap(standing.healthyDay + 1, Number.MAX_SAFE_INTEGER)
      : capBefore;

    await prisma.senderReputationAssessment.create({
      data: {
        storeId,
        provider,
        windowStartsAt: day.startsAt,
        windowEndsAt: day.endsAt,
        attempted: evidence.attempted,
        delivered: evidence.delivered,
        bounced: evidence.bounced,
        complained: evidence.complained,
        // What the day supports right now. A healthy day that cannot raise the
        // tier (held, paused, or at a tier it predates) is recorded as a hold,
        // so this row never reads as growth that did not and could not happen.
        action: eligibility.eligible ? "grow" : assessment.action === "grow" ? "hold" : assessment.action,
        dailyCapBefore: capBefore,
        dailyCapAfter: capAfter,
        evidence: {
          kind: CLOSED_DAY_RECOMMENDATION,
          automated: true,
          applied: false,
          dayAssessment: assessment.action,
          reason: assessment.action === "grow" ? eligibility.reason : assessment.reason,
          growthEligible: eligibility.eligible,
          bounceRate: evidence.attempted ? evidence.bounced / evidence.attempted : 0,
          complaintRate: evidence.delivered ? evidence.complained / evidence.delivered : 0,
          settleHours: EVIDENCE_SETTLE_HOURS,
        },
        // Unreviewed on purpose: a recommendation, not a decision.
        reviewedAt: null,
      },
    });
    recorded += 1;

    if (eligibility.eligible) {
      growthReady += 1;
      await prisma.agentObservation.create({
        data: {
          storeId,
          type: "sender_reputation_growth_ready",
          severity: "info",
          summary: `A healthy sending day supports raising the daily cap from ${capBefore.toLocaleString("en-IN")} to ${capAfter.toLocaleString("en-IN")} messages.`,
          data: {
            provider,
            day: day.startsAt.toISOString().slice(0, 10),
            attempted: evidence.attempted,
            dailyCapBefore: capBefore,
            dailyCapAfter: capAfter,
          },
          suggestedAction: {
            type: "review_sender_reputation",
            description: "Review the day's delivery evidence and record the increase with a rollback condition.",
          },
        },
      });
    }
  }
  return { day, senders: senders.length, recorded, alreadyRecorded, growthReady };
}
