export type SesAttemptState = "reserved" | "submitting" | "accepted" | "ambiguous" | "failed" | "manual_review";

/** States in which a queue replay must never call SES again. */
export function replayDisposition(state: SesAttemptState | undefined): "submit" | "accepted" | "reconcile" {
  if (state === "accepted") return "accepted";
  if (state === "submitting" || state === "ambiguous" || state === "manual_review") return "reconcile";
  return "submit";
}
