export type Currency = "INR" | "USD";

export interface PricingConfig {
  version: string;
  liftFeeBasisPoints: number;
  capFactorBasisPoints: number;
  postagePerThousandMinor: Record<Currency, number>;
  providerCostPerThousandMinor: Record<Currency, number>;
  fx: {
    inrPerUsdMinor: number;
    sourceUrl: string;
    sourcedAt: string;
  };
  postageSource: {
    sourceUrl: string;
    sourcedAt: string;
    plan: "ses-a-la-carte";
  };
}

/**
 * Versioned operational defaults. INR is paise and USD is cents. The INR
 * postage is deliberately rounded up from the configured USD/INR conversion.
 */
export const PRICING_CONFIG = Object.freeze<PricingConfig>({
  version: "2026-09-10.v1",
  liftFeeBasisPoints: 2_000,
  capFactorBasisPoints: 10_000,
  postagePerThousandMinor: { INR: 900, USD: 10 },
  providerCostPerThousandMinor: { INR: 850, USD: 10 },
  fx: {
    inrPerUsdMinor: 8_500,
    sourceUrl: "founder-configured",
    sourcedAt: "2026-09-10",
  },
  postageSource: {
    sourceUrl: "https://aws.amazon.com/ses/pricing/",
    sourcedAt: "2026-09-10",
    plan: "ses-a-la-carte",
  },
});

export interface RevenueModel {
  /** Monthly visitors per active subscriber. */
  visitorsPerSubscriber: number;
  /** Storefront conversion rate. 100 bp = 1%. */
  conversionBasisPoints: number;
  averageOrderValueMinor: Record<Currency, number>;
  /** Extra revenue the existing list contributes on top. 2,000 bp = +20%. */
  subscriberUpliftBasisPoints: number;
}

/**
 * Ties store revenue to list size for the public estimator, so the two inputs
 * cannot drift into impossible combinations (a million subscribers on a
 * fifteen-lakh store). Illustrative defaults, not a measured benchmark: the
 * merchant can always overwrite the revenue we derive.
 */
export const REVENUE_MODEL = Object.freeze<RevenueModel>({
  visitorsPerSubscriber: 1,
  conversionBasisPoints: 100,
  averageOrderValueMinor: { INR: 200_000, USD: 2_000 },
  subscriberUpliftBasisPoints: 2_000,
});

/**
 * Monthly store revenue implied by a list size, so the estimator's two headline
 * inputs stay tied to one another. Visits convert at the model's rate and
 * average order value, then the existing list adds its uplift on top.
 */
export function deriveMonthlyRevenueMinor(
  activeSubscribers: number,
  currency: Currency,
  model: RevenueModel = REVENUE_MODEL,
): number {
  if (!Number.isSafeInteger(activeSubscribers) || activeSubscribers < 0) {
    throw new RangeError("activeSubscribers must be a non-negative safe integer");
  }
  const visits = activeSubscribers * model.visitorsPerSubscriber;
  const grossMinor = visits * model.averageOrderValueMinor[currency];
  const convertedMinor = Math.round((grossMinor * model.conversionBasisPoints) / 10_000);
  const withUpliftMinor = Math.round(
    (convertedMinor * (10_000 + model.subscriberUpliftBasisPoints)) / 10_000,
  );
  if (!Number.isSafeInteger(withUpliftMinor)) {
    throw new RangeError("derived revenue exceeds safe integer range");
  }
  return withUpliftMinor;
}

export const LIFT_FEE_RATE = PRICING_CONFIG.liftFeeBasisPoints / 10_000;
export const CAP_FACTOR = PRICING_CONFIG.capFactorBasisPoints / 10_000;

export function providerEmailCostMinor(currency: Currency): number {
  return PRICING_CONFIG.providerCostPerThousandMinor[currency];
}
