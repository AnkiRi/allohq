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

export const LIFT_FEE_RATE = PRICING_CONFIG.liftFeeBasisPoints / 10_000;
export const CAP_FACTOR = PRICING_CONFIG.capFactorBasisPoints / 10_000;

export function providerEmailCostMinor(currency: Currency): number {
  return PRICING_CONFIG.providerCostPerThousandMinor[currency];
}
