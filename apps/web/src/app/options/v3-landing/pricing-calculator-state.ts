import type { Currency } from "@allohq/pricing";

/**
 * "platform" is the published Email-plan benchmark. It is deliberately not
 * named in the interface: the comparison rests on a sourced, dated price, not
 * on a competitor's brand.
 */
export type PricingCalculatorTool = "platform" | "entered_bill";

/** The benchmark evidence stops here; beyond it there is no published price. */
export const MAX_COMPARABLE_SUBSCRIBERS = 150_000;
export const MIN_SUBSCRIBERS = 1_000;

export interface PricingCalculatorInitialState {
  subscribers: number;
  revenue: number;
  revenueTouched: boolean;
  emailShare: number;
  causedShare: number;
  blasts: number;
  currency: Currency;
  tool: PricingCalculatorTool;
  enteredBill: number;
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
  tool: "platform",
  enteredBill: 25_000,
};
