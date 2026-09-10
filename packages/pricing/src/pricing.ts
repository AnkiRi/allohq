import { PRICING_CONFIG, type Currency, type PricingConfig } from "./config";
import {
  comparisonPrice,
  type ComparisonPriceEvidence,
  type ComparisonPriceResult,
  type ComparisonTool,
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

export interface InvoiceUnit {
  unitType: "campaign" | "journey";
  unitId: string;
  causedMinor: number;
  tier: "empty" | "unmeasured" | "directional" | "measurement_ready";
  overlapsAnotherUnit: boolean;
}

export interface InvoiceLine {
  kind: "caused_revenue" | "carry_in" | "performance_fee" | "postage" | "cap";
  amountMinor: number;
}

export interface MonthlyInvoiceInput {
  units: readonly InvoiceUnit[];
  carryInMinor: number;
  postageEmails: number;
  activeSubscribers: number;
  monthlySends: number;
  currency: Currency;
  subscriberSnapshotAt: string;
  comparisonEvidence?: readonly ComparisonPriceEvidence[];
  config?: PricingConfig;
}

export interface MonthlyInvoice {
  currency: Currency;
  pricingVersion: string;
  billableCausedMinor: number;
  carryInMinor: number;
  carryOutMinor: number;
  uncappedPerformanceFeeMinor: number;
  performanceFeeCapMinor: number | null;
  performanceFeeCapStatus: "available" | "not_required_unavailable";
  liftFeeMinor: number;
  postageEmails: number;
  postageMinor: number;
  totalMinor: number;
  subscriberSnapshotAt: string;
  comparison: ComparisonPriceResult | null;
  pricingMetadata: {
    fxInrPerUsdMinor: number;
    fxSourceUrl: string;
    fxSourcedAt: string;
    postageSourceUrl: string;
    postageSourcedAt: string;
  };
  lines: InvoiceLine[];
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
      throw new RangeError(`stratum ${stratum.stratum} requires both treatment and control assignments`);
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

export function computeMonthlyInvoice(input: MonthlyInvoiceInput): MonthlyInvoice {
  const config = input.config ?? PRICING_CONFIG;
  assertInteger(input.postageEmails, "postageEmails");
  assertInteger(input.activeSubscribers, "activeSubscribers");
  assertInteger(input.monthlySends, "monthlySends");
  assertInteger(input.carryInMinor, "carryInMinor", true);
  const billableCausedMinor = input.units
    .filter((unit) => unit.unitType === "campaign" && unit.tier === "measurement_ready" && !unit.overlapsAnotherUnit)
    .reduce((sum, unit) => {
      assertInteger(unit.causedMinor, "unit.causedMinor", true);
      return sum + unit.causedMinor;
    }, 0);
  const netMinor = billableCausedMinor + input.carryInMinor;
  const carryOutMinor = Math.min(0, netMinor);
  const uncappedPerformanceFeeMinor = applyBasisPoints(Math.max(0, netMinor), config.liftFeeBasisPoints);
  const comparison = uncappedPerformanceFeeMinor > 0
    ? comparisonPrice(
        "klaviyo",
        {
          currency: input.currency,
          activeSubscribers: input.activeSubscribers,
          monthlySends: input.monthlySends,
        },
        input.comparisonEvidence,
      )
    : null;
  const performanceFeeCapMinor = comparison === null
    ? null
    : applyBasisPoints(comparison.priceMinor, config.capFactorBasisPoints);
  const liftFeeMinor = performanceFeeCapMinor === null
    ? 0
    : Math.min(uncappedPerformanceFeeMinor, performanceFeeCapMinor);
  const postageMinor = safeNumber(
    roundedRatio(
      BigInt(input.postageEmails) * BigInt(config.postagePerThousandMinor[input.currency]),
      1_000n,
    ),
    "postageMinor",
  );
  const totalMinor = liftFeeMinor + postageMinor;
  return {
    currency: input.currency,
    pricingVersion: config.version,
    billableCausedMinor,
    carryInMinor: input.carryInMinor,
    carryOutMinor,
    uncappedPerformanceFeeMinor,
    performanceFeeCapMinor,
    performanceFeeCapStatus: performanceFeeCapMinor === null ? "not_required_unavailable" : "available",
    liftFeeMinor,
    postageEmails: input.postageEmails,
    postageMinor,
    totalMinor,
    subscriberSnapshotAt: input.subscriberSnapshotAt,
    comparison,
    pricingMetadata: {
      fxInrPerUsdMinor: config.fx.inrPerUsdMinor,
      fxSourceUrl: config.fx.sourceUrl,
      fxSourcedAt: config.fx.sourcedAt,
      postageSourceUrl: config.postageSource.sourceUrl,
      postageSourcedAt: config.postageSource.sourcedAt,
    },
    lines: [
      { kind: "caused_revenue", amountMinor: billableCausedMinor },
      { kind: "carry_in", amountMinor: input.carryInMinor },
      { kind: "performance_fee", amountMinor: liftFeeMinor },
      { kind: "postage", amountMinor: postageMinor },
      ...(performanceFeeCapMinor === null
        ? []
        : [{ kind: "cap" as const, amountMinor: performanceFeeCapMinor }]),
    ],
  };
}

export interface CalculatorScenarioInput {
  activeSubscribers: number;
  monthlyRevenueMinor: number;
  emailRevenueShareBasisPoints: number;
  causedShareBasisPoints: number;
  merchantBlastCount: number;
  currency: Currency;
  comparisonTool: ComparisonTool;
  enteredBillMinor?: number;
  comparisonEvidence?: readonly ComparisonPriceEvidence[];
  subscriberSnapshotAt: string;
  config?: PricingConfig;
}

export function computeCalculatorScenario(input: CalculatorScenarioInput) {
  assertInteger(input.monthlyRevenueMinor, "monthlyRevenueMinor");
  assertInteger(input.emailRevenueShareBasisPoints, "emailRevenueShareBasisPoints");
  assertInteger(input.causedShareBasisPoints, "causedShareBasisPoints");
  assertInteger(input.merchantBlastCount, "merchantBlastCount");
  const emailRevenueMinor = applyBasisPoints(input.monthlyRevenueMinor, input.emailRevenueShareBasisPoints);
  const causedMinor = applyBasisPoints(emailRevenueMinor, input.causedShareBasisPoints);
  const monthlySends = input.activeSubscribers * input.merchantBlastCount;
  assertInteger(monthlySends, "monthlySends");
  const invoice = computeMonthlyInvoice({
    units: [{
      unitType: "campaign",
      unitId: "calculator-scenario",
      causedMinor,
      tier: "measurement_ready",
      overlapsAnotherUnit: false,
    }],
    carryInMinor: 0,
    postageEmails: monthlySends,
    activeSubscribers: input.activeSubscribers,
    monthlySends,
    currency: input.currency,
    subscriberSnapshotAt: input.subscriberSnapshotAt,
    comparisonEvidence: input.comparisonEvidence,
    config: input.config,
  });
  const traditional = input.enteredBillMinor === undefined
    ? comparisonPrice(input.comparisonTool, {
        currency: input.currency,
        activeSubscribers: input.activeSubscribers,
        monthlySends,
      }, input.comparisonEvidence)
    : (() => {
        assertInteger(input.enteredBillMinor, "enteredBillMinor");
        return {
          tool: "entered_bill" as const,
          currency: input.currency,
          priceMinor: input.enteredBillMinor,
          basis: { kind: "entered_bill" as const },
        };
      })();
  return {
    emailRevenueMinor,
    causedMinor,
    merchantRequestedEmails: monthlySends,
    invoice,
    traditional,
    merchantKeepsMinor: causedMinor - invoice.liftFeeMinor,
  };
}
