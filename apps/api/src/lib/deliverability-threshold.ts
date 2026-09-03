export interface DeliverabilityWindow {
  complaints: number;
  hardBounces: number;
  rejections: number;
  attempted: number;
}

export type DeliverabilityPauseReason = "complaints" | "hard_bounces" | "provider_rejections";

export function deliverabilityPauseReason(window: DeliverabilityWindow): DeliverabilityPauseReason | null {
  const { complaints, hardBounces, rejections, attempted } = window;
  if (complaints >= 3 || (attempted >= 1_000 && complaints / attempted >= 0.001)) return "complaints";
  if (hardBounces >= 5 || (attempted >= 100 && hardBounces / attempted >= 0.05)) return "hard_bounces";
  if (rejections >= 5 || (attempted >= 100 && rejections / attempted >= 0.02)) return "provider_rejections";
  return null;
}
