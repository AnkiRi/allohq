export interface WarmupHealth { delivered: number; bounced: number; complained: number }
export type WarmupAction = "grow" | "hold" | "pause";

export function warmupDailyCap(day: number, eligible: number): number {
  if (!Number.isInteger(day) || day < 1 || !Number.isInteger(eligible) || eligible < 0) throw new RangeError("Invalid warmup inputs");
  return Math.min(eligible, 500 * 2 ** Math.min(day - 1, 30));
}

export function warmupHealthAction(health: WarmupHealth): WarmupAction {
  const attempted = health.delivered + health.bounced;
  const bounceRate = attempted ? health.bounced / attempted : 0;
  const complaintRate = health.delivered ? health.complained / health.delivered : 0;
  if (complaintRate > 0.003) return "pause";
  if (bounceRate > 0.02 || complaintRate > 0.001) return "hold";
  if (attempted === 0) return "hold";
  return "grow";
}

export function engagementRank(input: { clickedOrBoughtAt?: Date | null; openedAt?: Date | null }, now = new Date()): 0 | 1 | 2 {
  const age = input.clickedOrBoughtAt ? now.getTime() - input.clickedOrBoughtAt.getTime() : Infinity;
  if (age <= 30 * 86_400_000) return 0;
  if (age <= 90 * 86_400_000) return 1;
  return 2;
}

// -----------------------------------------------------------------------------
// Closed sending days.
//
// The ramp may double only after a healthy sending day, judged on evidence that
// has had time to arrive. Hard bounces land within minutes, but complaints from
// mailbox feedback loops can take a day or more. A rolling "last 24 hours" read
// counts today's sends before their complaints exist, so it reports a day as
// healthier than it turns out to be.
// -----------------------------------------------------------------------------

/**
 * A day with fewer attempts than this cannot justify growth. One seed send, or
 * a handful, is not evidence of stable reputation however clean it looks.
 */
export const MIN_ATTEMPTS_FOR_GROWTH = 100;

/** How long after a sending day ends before its events are treated as settled. */
export const EVIDENCE_SETTLE_HOURS = 48;

const DAY_MS = 86_400_000;

/**
 * The most recent UTC sending day whose events have settled: a day
 * [startsAt, endsAt) with endsAt + settle <= now.
 */
export function latestClosedSendingDay(now: Date, settleHours = EVIDENCE_SETTLE_HOURS) {
  const cutoff = now.getTime() - settleHours * 3_600_000 - DAY_MS;
  const startsAt = new Date(Math.floor(cutoff / DAY_MS) * DAY_MS);
  return { startsAt, endsAt: new Date(startsAt.getTime() + DAY_MS) };
}

export interface SendingDayEvidence extends WarmupHealth {
  /** Every message sent that day, whatever its outcome. */
  attempted: number;
}

export interface SendingDayAssessment {
  action: WarmupAction;
  reason: string;
}

/**
 * One provider-neutral judgement of a single sending day.
 *
 * The minimum volume lives here, not in a caller, so every path that asks
 * "may this store grow?" gets the same answer — the manual review and the
 * scheduled reconciliation alike.
 */
export function assessSendingDay(
  evidence: SendingDayEvidence,
  options: { closed: boolean },
): SendingDayAssessment {
  if (!options.closed) {
    return { action: "hold", reason: "This sending day's delivery events have not settled yet." };
  }
  // Tightening needs no minimum: a complaint spike on a small day still counts.
  const action = warmupHealthAction(evidence);
  if (action === "pause") {
    return { action, reason: "Complaint rate is above the safety threshold; pause and review the audience and copy." };
  }
  if (action === "hold") {
    return {
      action,
      reason: evidence.attempted === 0
        ? "Nothing was sent that day, so it cannot count towards growth."
        : evidence.delivered + evidence.bounced === 0
          ? "No delivery or bounce events arrived for that day's sends. Growth waits for provider evidence; check that delivery events are being received."
          : "Bounce or complaint evidence requires holding the current volume tier.",
    };
  }
  if (evidence.attempted < MIN_ATTEMPTS_FOR_GROWTH) {
    return {
      action: "hold",
      reason: `Hold until a sending day has at least ${MIN_ATTEMPTS_FOR_GROWTH} delivery attempts (${evidence.attempted} that day).`,
    };
  }
  return { action: "grow", reason: "Delivery health is inside Joon's conservative bounce and complaint thresholds." };
}

export interface WarmupStanding {
  healthyDay: number;
  lastGrowthAt: Date;
  heldUntil: Date | null;
  pausedAt: Date | null;
}

/**
 * Whether a closed day's evidence may raise the tier now.
 *
 * - An automated hold or pause is lifted only by an explicit, recorded
 *   override. A review is not an override, so it cannot clear one.
 * - Each tier must earn its own healthy day: evidence from a day that began
 *   before the last growth (or before a hold ended) was traffic at the
 *   previous tier, and one day's evidence can raise the tier only once.
 */
export function growthEligibility(input: {
  day: { startsAt: Date };
  assessment: SendingDayAssessment;
  warmup: WarmupStanding;
  now: Date;
}): { eligible: boolean; reason: string } {
  const { warmup, now } = input;
  if (warmup.pausedAt) {
    return { eligible: false, reason: "Sending is paused for a deliverability review. Lifting it needs an explicit override with a recorded reason." };
  }
  if (warmup.heldUntil && warmup.heldUntil > now) {
    return { eligible: false, reason: `Volume is held until ${warmup.heldUntil.toISOString().slice(0, 10)}. Lifting it early needs an explicit override with a recorded reason.` };
  }
  if (input.assessment.action !== "grow") {
    return { eligible: false, reason: input.assessment.reason };
  }
  if (input.day.startsAt < warmup.lastGrowthAt) {
    return { eligible: false, reason: "The last settled sending day began before the current tier did. The next increase waits for a full healthy day at this tier." };
  }
  if (warmup.healthyDay >= 31) {
    return { eligible: false, reason: "The ramp is already at its highest tier." };
  }
  return { eligible: true, reason: input.assessment.reason };
}
