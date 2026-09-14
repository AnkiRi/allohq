import type { Currency } from "@allohq/pricing";

/** The benchmark evidence stops here; beyond it there is no published price. */
export const MAX_COMPARABLE_SUBSCRIBERS = 1_000_000;
export const MIN_SUBSCRIBERS = 1_000;

export interface PricingCalculatorInitialState {
  subscribers: number;
  campaigns: number;
  suppression: number;
  control: number;
  openRate: number;
  clickThroughRate: number;
  conversionRate: number;
  averageOrderValue: number;
  sessions: number;
  cartIncidence: number;
  recoveryRate: number;
  currency: Currency;
}

export const PRICING_CALCULATOR_DEFAULTS: PricingCalculatorInitialState = {
  subscribers: 50_000,
  campaigns: 4,
  suppression: 20,
  control: 15,
  openRate: 20,
  clickThroughRate: 4,
  conversionRate: 2,
  averageOrderValue: 2_000,
  sessions: 50_000,
  cartIncidence: 5,
  recoveryRate: 5,
  currency: "INR",
};
