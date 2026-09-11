import { PRICING_CONFIG, type Currency } from "./config";

export type ComparisonTool = "klaviyo" | "shopify_email";

export interface ProfilePriceTier {
  upTo: number | null;
  priceMinor: number;
}

export interface SendPriceBand {
  upTo: number | null;
  pricePerThousandMinor: number;
}

interface EvidenceBase {
  tool: ComparisonTool;
  currency: Currency;
  sourceUrl: string;
  sourcedAt: string;
  evidenceStatus: "private_unapproved" | "public_approved";
}

export type ComparisonPriceEvidence =
  | (EvidenceBase & {
      model: "active_profiles";
      tiers: readonly ProfilePriceTier[];
    })
  | (EvidenceBase & {
      model: "monthly_sends_progressive";
      bands: readonly SendPriceBand[];
    });

export interface ComparisonPriceResult {
  tool: ComparisonTool;
  currency: Currency;
  priceMinor: number;
  sourceUrl: string;
  sourcedAt: string;
  publicDisplayApproved: boolean;
  derivedFromCurrency?: Currency;
  fxVersion?: string;
  basis: { kind: "active_profiles" | "monthly_sends"; quantity: number };
}

/** A real invoice cannot be finalized until approved cap evidence exists. */
export class MissingComparisonCapEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingComparisonCapEvidenceError";
  }
}

export const SHOPIFY_EMAIL_USD_EVIDENCE: ComparisonPriceEvidence = {
  tool: "shopify_email",
  model: "monthly_sends_progressive",
  currency: "USD",
  bands: [
    { upTo: 10_000, pricePerThousandMinor: 0 },
    { upTo: 300_000, pricePerThousandMinor: 100 },
    { upTo: 750_000, pricePerThousandMinor: 65 },
    { upTo: null, pricePerThousandMinor: 55 },
  ],
  sourceUrl: "https://help.shopify.com/en/manual/promoting-marketing/create-marketing/shopify-messaging/email/pricing",
  sourcedAt: "2026-09-11",
  evidenceStatus: "public_approved",
};

export const COMPARISON_PRICE_EVIDENCE: readonly ComparisonPriceEvidence[] = [
  SHOPIFY_EMAIL_USD_EVIDENCE,
];

function assertCount(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function roundedRatio(numerator: bigint, denominator: bigint): number {
  const result = Number((numerator + denominator / 2n) / denominator);
  if (!Number.isSafeInteger(result)) throw new RangeError("comparison price exceeds safe integer range");
  return result;
}

function progressiveSendPrice(sends: number, bands: readonly SendPriceBand[]): number {
  let lowerBound = 0;
  let totalNumerator = 0n;
  for (const band of bands) {
    const upperBound = band.upTo ?? sends;
    const count = Math.max(0, Math.min(sends, upperBound) - lowerBound);
    totalNumerator += BigInt(count) * BigInt(band.pricePerThousandMinor);
    if (sends <= upperBound) return roundedRatio(totalNumerator, 1_000n);
    lowerBound = upperBound;
  }
  throw new Error(`progressive comparison pricing does not cover ${sends} sends`);
}

function priceFromEvidence(record: ComparisonPriceEvidence, quantity: number): number {
  if (record.model === "monthly_sends_progressive") {
    return progressiveSendPrice(quantity, record.bands);
  }
  const tier = record.tiers.find((candidate) => candidate.upTo === null || quantity <= candidate.upTo);
  if (!tier) throw new Error(`${record.tool} comparison pricing does not cover ${quantity}`);
  return tier.priceMinor;
}

export function comparisonPrice(
  tool: ComparisonTool,
  input: {
    currency: Currency;
    activeSubscribers: number;
    monthlySends: number;
    publicDisplay?: boolean;
  },
  evidence: readonly ComparisonPriceEvidence[] = COMPARISON_PRICE_EVIDENCE,
): ComparisonPriceResult {
  assertCount(input.activeSubscribers, "activeSubscribers");
  assertCount(input.monthlySends, "monthlySends");
  const exact = evidence.find((entry) => entry.tool === tool && entry.currency === input.currency);
  const derived = input.currency === "INR"
    ? evidence.find((entry) => entry.tool === tool && entry.currency === "USD")
    : undefined;
  const record = exact ?? derived;
  if (!record) throw new MissingComparisonCapEvidenceError(`No verified ${tool} comparison price for ${input.currency}`);
  if (input.publicDisplay && record.evidenceStatus !== "public_approved") {
    throw new Error(`${tool} comparison price is not approved for public display`);
  }
  const quantity = record.model === "active_profiles" ? input.activeSubscribers : input.monthlySends;
  const sourcePriceMinor = priceFromEvidence(record, quantity);
  const isFxDerived = record.currency !== input.currency;
  const priceMinor = isFxDerived
    ? roundedRatio(BigInt(sourcePriceMinor) * BigInt(PRICING_CONFIG.fx.inrPerUsdMinor), 100n)
    : sourcePriceMinor;
  return {
    tool,
    currency: input.currency,
    priceMinor,
    sourceUrl: record.sourceUrl,
    sourcedAt: record.sourcedAt,
    publicDisplayApproved: record.evidenceStatus === "public_approved",
    ...(isFxDerived ? { derivedFromCurrency: record.currency, fxVersion: PRICING_CONFIG.version } : {}),
    basis: {
      kind: record.model === "active_profiles" ? "active_profiles" : "monthly_sends",
      quantity,
    },
  };
}
