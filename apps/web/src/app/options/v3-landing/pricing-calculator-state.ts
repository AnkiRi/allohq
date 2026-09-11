import type { Currency } from "@allohq/pricing";

export type PricingCalculatorTool = "shopify_email" | "entered_bill";

export interface PricingCalculatorInitialState {
  subscribers: number;
  revenue: number;
  emailShare: number;
  causedShare: number;
  blasts: number;
  currency: Currency;
  tool: PricingCalculatorTool;
  enteredBill: number;
}

export const PRICING_CALCULATOR_DEFAULTS: PricingCalculatorInitialState = {
  subscribers: 70_000,
  revenue: 1_500_000,
  emailShare: 20,
  causedShare: 40,
  blasts: 4,
  currency: "INR",
  tool: "shopify_email",
  enteredBill: 25_000,
};
