import type { FunnelStage } from "./funnel-stage";
import type { Festivity } from "./festivity-calendar";

export type EmailIntent =
  | "welcome"
  | "cart_recovery"
  | "post_purchase"
  | "win_back"
  | "seasonal"
  | "promotion"
  | "re_engagement"
  | "browse_abandonment"
  | "vip_reward";

export interface IntentContext {
  funnelStage: FunnelStage;
  daysSinceLastPurchase?: number;
  upcomingFestivity?: Festivity | null;
  hasAbandonedCart?: boolean;
  isNewCustomer?: boolean;
  isVip?: boolean;
}

/**
 * Determine the best email intent given the customer's context.
 */
export function getEmailIntent(context: IntentContext): EmailIntent {
  const { funnelStage, daysSinceLastPurchase, upcomingFestivity, hasAbandonedCart, isNewCustomer, isVip } = context;

  // Cart recovery takes highest priority
  if (hasAbandonedCart) {
    return "cart_recovery";
  }

  // New customer gets welcome
  if (isNewCustomer) {
    return "welcome";
  }

  // Recent purchase — send post-purchase follow-up
  if (daysSinceLastPurchase !== undefined && daysSinceLastPurchase <= 3) {
    return "post_purchase";
  }

  // Upcoming festivity — seasonal campaign
  if (upcomingFestivity) {
    // Major sale events get promotion intent
    if (
      upcomingFestivity.name === "Black Friday" ||
      upcomingFestivity.name === "Cyber Monday" ||
      upcomingFestivity.name === "Diwali"
    ) {
      return "promotion";
    }
    return "seasonal";
  }

  // VIP customers get special treatment
  if (isVip) {
    return "vip_reward";
  }

  // Map funnel stage to intent
  switch (funnelStage) {
    case "advocacy":
      return "vip_reward";
    case "retention":
      return daysSinceLastPurchase !== undefined && daysSinceLastPurchase > 60
        ? "win_back"
        : "re_engagement";
    case "purchase":
      return "promotion";
    case "consideration":
      return "browse_abandonment";
    case "awareness":
      return "win_back";
    default:
      return "re_engagement";
  }
}
