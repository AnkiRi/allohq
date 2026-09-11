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
  return "grow";
}

export function engagementRank(input: { clickedOrBoughtAt?: Date | null; openedAt?: Date | null }, now = new Date()): 0 | 1 | 2 {
  const age = input.clickedOrBoughtAt ? now.getTime() - input.clickedOrBoughtAt.getTime() : Infinity;
  if (age <= 30 * 86_400_000) return 0;
  if (age <= 90 * 86_400_000) return 1;
  return 2;
}
