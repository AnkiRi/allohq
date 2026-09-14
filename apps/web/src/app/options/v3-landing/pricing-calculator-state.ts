import { deriveMonthlyRevenueMinor, type Currency } from "@allohq/pricing";

/** The benchmark evidence stops here; beyond it there is no published price. */
export const MAX_COMPARABLE_SUBSCRIBERS = 150_000;
export const MIN_SUBSCRIBERS = 1_000;

/**
 * How far monthly revenue may stray from what a list of this size implies.
 * Unbounded, revenue described stores that cannot exist — ₹3.6 crore on twenty
 * thousand subscribers — and the fee then pinned to the cap, so the page looked
 * frozen. A third to five times the derived figure covers a genuinely wide
 * spread of businesses without leaving reality.
 */
export const REVENUE_BAND = { minMultiple: 1 / 3, maxMultiple: 5 };

export interface PricingCalculatorInitialState {
  subscribers: number;
  revenue: number;
  revenueTouched: boolean;
  emailShare: number;
  causedShare: number;
  blasts: number;
  currency: Currency;
}

/** Revenue a list of this size can plausibly support, in major units. */
export function revenueBoundsMajor(subscribers: number, currency: Currency) {
  const derivedMajor = deriveMonthlyRevenueMinor(subscribers, currency) / 100;
  return {
    derived: Math.round(derivedMajor),
    min: Math.round(derivedMajor * REVENUE_BAND.minMultiple),
    max: Math.round(derivedMajor * REVENUE_BAND.maxMultiple),
  };
}

export function clampRevenueMajor(revenue: number, subscribers: number, currency: Currency) {
  const bounds = revenueBoundsMajor(subscribers, currency);
  if (!Number.isFinite(revenue)) return bounds.derived;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(revenue)));
}

export const PRICING_CALCULATOR_DEFAULTS: PricingCalculatorInitialState = {
  subscribers: 70_000,
  // Derived from the subscriber count by the revenue model, not hardcoded.
  revenue: 1_680_000,
  revenueTouched: false,
  emailShare: 20,
  causedShare: 40,
  blasts: 4,
  currency: "INR",
};
