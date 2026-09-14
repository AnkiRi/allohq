import { deriveMonthlyRevenueMinor, type Currency } from "@allohq/pricing";

/** The benchmark evidence stops here; beyond it there is no published price. */
export const MAX_COMPARABLE_SUBSCRIBERS = 150_000;
export const MIN_SUBSCRIBERS = 1_000;

/**
 * Revenue is no longer an input. A typed figure could describe a store that
 * cannot exist — ₹3.6 crore on twenty thousand subscribers — which pinned the
 * fee to its cap and made the page look frozen. It is now derived from list
 * size and shown with the assumption stated.
 */

export interface PricingCalculatorInitialState {
  subscribers: number;
  emailShare: number;
  causedShare: number;
  blasts: number;
  currency: Currency;
}

/** Monthly revenue a list of this size implies, in major units. */
export function derivedRevenueMajor(subscribers: number, currency: Currency) {
  return Math.round(deriveMonthlyRevenueMinor(subscribers, currency) / 100);
}

export const PRICING_CALCULATOR_DEFAULTS: PricingCalculatorInitialState = {
  subscribers: 70_000,
  emailShare: 20,
  causedShare: 40,
  blasts: 4,
  currency: "INR",
};
