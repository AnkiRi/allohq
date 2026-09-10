import type { GovernorDecision } from "@allohq/communication-governor";

/**
 * A quiet-hours decision is a deferral, never a suppression. Keeping this
 * small policy pure prevents automation nodes from accidentally advancing or
 * recording a terminal MessageLog while the customer's clock is quiet.
 */
export function quietHoursDeferralMs(decision: GovernorDecision, now: Date): number | null {
  if (decision.allowed || decision.rule !== "quiet_hours" || !decision.delayUntil) return null;
  return Math.max(0, decision.delayUntil.getTime() - now.getTime());
}
