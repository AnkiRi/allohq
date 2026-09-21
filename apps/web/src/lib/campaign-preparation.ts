/**
 * What the campaign page shows while Joon works out an audience.
 *
 * Preparation is a background job: approving a 100k campaign returns in
 * milliseconds and the work continues without the page. Before this, the
 * campaign simply sat in Draft afterwards with nothing to explain itself, which
 * read as a dead end.
 *
 * The view model is pure so it can be tested without a DOM, and so the wording
 * lives in one place rather than being assembled inline in the page.
 */

export interface PreparationProgress {
  runId: string;
  state: "preparing" | "ready" | "needs_attention";
  evaluated: number;
  candidates: number;
  deliberatelyLeftAlone: number;
  notReceiving: number;
  control: number;
  treatment: number;
  startedAt: string | Date;
  completedAt: string | Date | null;
  attempts: number;
  recoverable: boolean;
  detail: string | null;
}

export interface PreparationCount {
  label: string;
  value: number;
  /** One line explaining the number in the merchant's terms. */
  hint: string;
}

export type PreparationView =
  | { kind: "none"; poll: false; sendingBlocked: false }
  | {
      kind: "preparing";
      poll: true;
      sendingBlocked: true;
      headline: string;
      note: string;
      reassurance: string;
      counts: PreparationCount[];
    }
  | {
      kind: "needs_attention";
      poll: false;
      sendingBlocked: true;
      headline: string;
      reason: string;
      reassurance: string;
      retryLabel: string;
    }
  | { kind: "ready"; poll: false; sendingBlocked: false };

/**
 * Counts worth showing. Zeroes are dropped while work is still in flight,
 * because "0 left alone" three seconds in means "not counted yet", not "none".
 */
function countsFor(progress: PreparationProgress): PreparationCount[] {
  const all: PreparationCount[] = [
    {
      label: "Looked at",
      value: progress.evaluated,
      hint: "Everyone in this campaign's audience Joon has considered so far.",
    },
    {
      label: "Not receiving",
      value: progress.notReceiving,
      hint: "Unsubscribed, no email, or otherwise unavailable to contact.",
    },
    {
      label: "Deliberately left alone",
      value: progress.deliberatelyLeftAlone,
      hint: "Joon decided this campaign wasn't right for them just now.",
    },
    {
      label: "Campaign candidates",
      value: progress.candidates,
      hint: "Everyone who could receive this campaign.",
    },
    {
      label: "Control group",
      value: progress.control,
      hint: "Held back so you can see what this campaign actually caused.",
    },
    {
      label: "Treatment group",
      value: progress.treatment,
      hint: "Will receive the campaign once you approve delivery.",
    },
  ];
  return all.filter((count) => count.value > 0);
}

export function preparationView(
  progress: PreparationProgress | null | undefined
): PreparationView {
  if (!progress) return { kind: "none", poll: false, sendingBlocked: false };

  if (progress.state === "ready") {
    return { kind: "ready", poll: false, sendingBlocked: false };
  }

  if (progress.state === "needs_attention") {
    return {
      kind: "needs_attention",
      poll: false,
      sendingBlocked: true,
      headline: "Joon needs another go at this audience",
      reason:
        progress.detail ??
        "Joon stopped partway through working out this audience and will try again on its own.",
      reassurance: "Nothing has been sent.",
      retryLabel: progress.recoverable ? "Try again now" : "Start again",
    };
  }

  return {
    kind: "preparing",
    poll: true,
    sendingBlocked: true,
    headline: "Joon is preparing who should receive this",
    note:
      progress.attempts > 1
        ? "Joon is picking this up again after an interruption. Work already done has been kept."
        : "Joon is working through your customers one group at a time.",
    reassurance: "You can leave this page or reload it — Joon keeps working either way.",
    counts: countsFor(progress),
  };
}

/**
 * Whether the merchant may approve delivery or schedule right now.
 *
 * A campaign is not sendable until its audience and the exact treatment and
 * control split are settled, so this is false for the whole time preparation
 * is in flight and for a run that needs another attempt.
 */
export function canApproveDelivery(input: {
  campaignStatus: string;
  progress: PreparationProgress | null | undefined;
  deliveryBlocked?: boolean;
}): boolean {
  if (input.deliveryBlocked) return false;
  if (input.campaignStatus !== "draft") return false;
  return !preparationView(input.progress).sendingBlocked;
}
