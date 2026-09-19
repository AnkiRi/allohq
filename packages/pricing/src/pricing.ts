import { PRICING_CONFIG, type Currency, type PricingConfig } from "./config";
import {
  comparisonPrice,
  type ComparisonPriceEvidence,
  type ComparisonPriceResult,
} from "./comparison-prices";

export interface CausedStratum {
  stratum: string;
  assignedTreated: number;
  assignedControl: number;
  treatedNetRevenueMinor: number;
  controlNetRevenueMinor: number;
}

export interface CausedResult {
  causedMinor: number;
  strata: Array<CausedStratum & { causedMinor: number }>;
}

export interface AttributedInvoiceInput {
  attributedRevenueMinor: number;
  activeSubscribers: number;
  monthlySends: number;
  currency: Currency;
  subscriberSnapshotAt: string;
  comparisonEvidence?: readonly ComparisonPriceEvidence[];
  config?: PricingConfig;
  allowUncappedPreview?: boolean;
}

export interface AttributedInvoice {
  currency: Currency;
  pricingVersion: string;
  attributedRevenueMinor: number;
  uncappedFeeMinor: number;
  feeMinor: number;
  capMinor: number | null;
  totalMinor: number;
  variants: { fivePercentMinor: number; sixPercentMinor: number; eightPercentMinor: number };
  comparison: ComparisonPriceResult | null;
  calculationKind: "invoice" | "uncapped_preview";
  subscriberSnapshotAt: string;
  lines: Array<{ kind: "attributed_revenue" | "attributed_fee" | "cap"; amountMinor: number }>;
}

export interface AttributedFunnelScenarioInput {
  activeSubscribers: number;
  campaignsPerMonth: number;
  suppressionBasisPoints: number;
  controlBasisPoints: number;
  openRateBasisPoints: number;
  clickThroughRateBasisPoints: number;
  conversionRateBasisPoints: number;
  averageOrderValueMinor: number;
  monthlySessions: number;
  abandonedCartIncidenceBasisPoints: number;
  abandonedCartRecoveryBasisPoints: number;
  currency: Currency;
  subscriberSnapshotAt: string;
  comparisonEvidence?: readonly ComparisonPriceEvidence[];
  config?: PricingConfig;
}

/** Pure, executable pitch maths. CTR is based on delivered emails; opens are diagnostic. */
export function computeAttributedFunnelScenario(input: AttributedFunnelScenarioInput) {
  const integerFields = [
    "activeSubscribers",
    "campaignsPerMonth",
    "suppressionBasisPoints",
    "controlBasisPoints",
    "openRateBasisPoints",
    "clickThroughRateBasisPoints",
    "conversionRateBasisPoints",
    "averageOrderValueMinor",
    "monthlySessions",
    "abandonedCartIncidenceBasisPoints",
    "abandonedCartRecoveryBasisPoints",
  ] as const;
  for (const field of integerFields) assertInteger(input[field], field);
  for (const field of [
    "suppressionBasisPoints",
    "controlBasisPoints",
    "openRateBasisPoints",
    "clickThroughRateBasisPoints",
    "conversionRateBasisPoints",
    "abandonedCartIncidenceBasisPoints",
    "abandonedCartRecoveryBasisPoints",
  ] as const) {
    if (input[field] > 10_000) throw new RangeError(`${field} cannot exceed 100%`);
  }
  const traditionalDelivered = input.activeSubscribers * input.campaignsPerMonth;
  assertInteger(traditionalDelivered, "traditionalDelivered");
  const campaignCandidates = applyBasisPoints(
    traditionalDelivered,
    10_000 - input.suppressionBasisPoints
  );
  const joonDelivered = applyBasisPoints(campaignCandidates, 10_000 - input.controlBasisPoints);
  const campaignOpens = applyBasisPoints(joonDelivered, input.openRateBasisPoints);
  const campaignClicks = applyBasisPoints(joonDelivered, input.clickThroughRateBasisPoints);
  const campaignOrders = applyBasisPoints(campaignClicks, input.conversionRateBasisPoints);
  const campaignAttributedRevenueMinor = campaignOrders * input.averageOrderValueMinor;
  assertInteger(campaignAttributedRevenueMinor, "campaignAttributedRevenueMinor");
  const abandonedCarts = applyBasisPoints(
    input.monthlySessions,
    input.abandonedCartIncidenceBasisPoints
  );
  const recoveredJourneyOrders = applyBasisPoints(
    abandonedCarts,
    input.abandonedCartRecoveryBasisPoints
  );
  const journeyAttributedRevenueMinor = recoveredJourneyOrders * input.averageOrderValueMinor;
  assertInteger(journeyAttributedRevenueMinor, "journeyAttributedRevenueMinor");
  const attributedRevenueMinor = campaignAttributedRevenueMinor + journeyAttributedRevenueMinor;
  const invoice = computeAttributedInvoice({
    attributedRevenueMinor,
    activeSubscribers: input.activeSubscribers,
    monthlySends: joonDelivered,
    currency: input.currency,
    subscriberSnapshotAt: input.subscriberSnapshotAt,
    comparisonEvidence: input.comparisonEvidence,
    config: input.config,
    allowUncappedPreview: true,
  });
  let traditional: ComparisonPriceResult | null = null;
  try {
    traditional = comparisonPrice(
      "klaviyo",
      {
        currency: input.currency,
        activeSubscribers: input.activeSubscribers,
        monthlySends: traditionalDelivered,
      },
      input.comparisonEvidence
    );
  } catch {
    // Public evidence currently stops at the last sourced tier. Never extrapolate it.
  }
  return {
    traditionalDelivered,
    campaignCandidates,
    deliberatelyLeftAlone: traditionalDelivered - campaignCandidates,
    controlCount: campaignCandidates - joonDelivered,
    joonDelivered,
    campaignOpens,
    campaignClicks,
    campaignOrders,
    campaignAttributedRevenueMinor,
    abandonedCarts,
    recoveredJourneyOrders,
    journeyAttributedRevenueMinor,
    attributedRevenueMinor,
    invoice,
    traditional,
  };
}

function assertInteger(value: number, name: string, allowNegative = false): void {
  if (!Number.isSafeInteger(value) || (!allowNegative && value < 0)) {
    throw new RangeError(`${name} must be ${allowNegative ? "a" : "a non-negative"} safe integer`);
  }
}

function roundedRatio(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute + denominator / 2n) / denominator;
  return negative ? -rounded : rounded;
}

function safeNumber(value: bigint, name: string): number {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted)) throw new RangeError(`${name} exceeds safe integer range`);
  return converted;
}

export function computeCaused(strata: readonly CausedStratum[]): CausedResult {
  const computed = strata.map((stratum) => {
    assertInteger(stratum.assignedTreated, "assignedTreated");
    assertInteger(stratum.assignedControl, "assignedControl");
    assertInteger(stratum.treatedNetRevenueMinor, "treatedNetRevenueMinor", true);
    assertInteger(stratum.controlNetRevenueMinor, "controlNetRevenueMinor", true);
    if (stratum.assignedTreated === 0 || stratum.assignedControl === 0) {
      throw new RangeError(
        `stratum ${stratum.stratum} requires both treatment and control assignments`
      );
    }
    const treatedRevenue = BigInt(stratum.treatedNetRevenueMinor);
    const controlRevenue = BigInt(stratum.controlNetRevenueMinor);
    const treatedCount = BigInt(stratum.assignedTreated);
    const controlCount = BigInt(stratum.assignedControl);
    const caused = treatedRevenue - roundedRatio(controlRevenue * treatedCount, controlCount);
    return { ...stratum, causedMinor: safeNumber(caused, "causedMinor") };
  });
  return {
    causedMinor: computed.reduce((sum, stratum) => sum + stratum.causedMinor, 0),
    strata: computed,
  };
}

function applyBasisPoints(amountMinor: number, basisPoints: number): number {
  assertInteger(amountMinor, "amountMinor");
  assertInteger(basisPoints, "basisPoints");
  return safeNumber(roundedRatio(BigInt(amountMinor) * BigInt(basisPoints), 10_000n), "fee");
}

export function computeAttributedInvoice(input: AttributedInvoiceInput): AttributedInvoice {
  const config = input.config ?? PRICING_CONFIG;
  assertInteger(input.attributedRevenueMinor, "attributedRevenueMinor");
  assertInteger(input.activeSubscribers, "activeSubscribers");
  assertInteger(input.monthlySends, "monthlySends");
  const uncappedFeeMinor = applyBasisPoints(
    input.attributedRevenueMinor,
    config.attributedFeeBasisPoints
  );
  let comparison: ComparisonPriceResult | null = null;
  if (uncappedFeeMinor > 0) {
    try {
      comparison = comparisonPrice(
        "klaviyo",
        {
          currency: input.currency,
          activeSubscribers: input.activeSubscribers,
          monthlySends: input.monthlySends,
        },
        input.comparisonEvidence
      );
    } catch (error) {
      if (!input.allowUncappedPreview) throw error;
    }
  }
  const capMinor = comparison
    ? applyBasisPoints(comparison.priceMinor, config.capFactorBasisPoints)
    : null;
  const feeMinor =
    capMinor === null
      ? input.allowUncappedPreview
        ? uncappedFeeMinor
        : 0
      : Math.min(uncappedFeeMinor, capMinor);
  return {
    currency: input.currency,
    pricingVersion: config.version,
    attributedRevenueMinor: input.attributedRevenueMinor,
    uncappedFeeMinor,
    feeMinor,
    capMinor,
    totalMinor: feeMinor,
    variants: {
      fivePercentMinor: applyBasisPoints(input.attributedRevenueMinor, 500),
      sixPercentMinor: applyBasisPoints(input.attributedRevenueMinor, 600),
      eightPercentMinor: applyBasisPoints(input.attributedRevenueMinor, 800),
    },
    comparison,
    calculationKind: comparison || uncappedFeeMinor === 0 ? "invoice" : "uncapped_preview",
    subscriberSnapshotAt: input.subscriberSnapshotAt,
    lines: [
      { kind: "attributed_revenue", amountMinor: input.attributedRevenueMinor },
      { kind: "attributed_fee", amountMinor: feeMinor },
      ...(capMinor === null ? [] : [{ kind: "cap" as const, amountMinor: capMinor }]),
    ],
  };
}
