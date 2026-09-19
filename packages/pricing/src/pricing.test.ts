import assert from "node:assert/strict";
import test from "node:test";
import {
  KLAVIYO_EMAIL_USD_EVIDENCE,
  comparisonPrice,
  computeAttributedFunnelScenario,
  computeAttributedInvoice,
  computeCaused,
  type ComparisonPriceEvidence,
} from "./index";

const evidence: ComparisonPriceEvidence[] = [
  {
    tool: "klaviyo",
    model: "active_profiles",
    currency: "INR",
    tiers: [{ upTo: 100_000, priceMinor: 6_000_000 }],
    sourceUrl: "https://example.test/private-klaviyo-evidence",
    sourcedAt: "2026-09-10",
    evidenceStatus: "private_unapproved",
  },
];

test("attributed billing computes 5/6/8 percent and charges no postage", () => {
  const invoice = computeAttributedInvoice({
    attributedRevenueMinor: 30_000_000,
    activeSubscribers: 50_000,
    monthlySends: 136_000,
    currency: "INR",
    subscriberSnapshotAt: "2026-09-14T00:00:00.000Z",
    comparisonEvidence: evidence,
  });
  assert.equal(invoice.feeMinor, 1_500_000);
  assert.deepEqual(invoice.variants, {
    fivePercentMinor: 1_500_000,
    sixPercentMinor: 1_800_000,
    eightPercentMinor: 2_400_000,
  });
  assert.equal(invoice.totalMinor, invoice.feeMinor);
  assert.deepEqual(invoice.lines.map((line) => line.kind), [
    "attributed_revenue",
    "attributed_fee",
    "cap",
  ]);
});

test("attributed funnel keeps suppression, control, campaigns and journeys distinct", () => {
  const result = computeAttributedFunnelScenario({
    activeSubscribers: 50_000,
    campaignsPerMonth: 4,
    suppressionBasisPoints: 2_000,
    controlBasisPoints: 1_500,
    openRateBasisPoints: 2_000,
    clickThroughRateBasisPoints: 400,
    conversionRateBasisPoints: 200,
    averageOrderValueMinor: 200_000,
    monthlySessions: 50_000,
    abandonedCartIncidenceBasisPoints: 500,
    abandonedCartRecoveryBasisPoints: 500,
    currency: "INR",
    subscriberSnapshotAt: "2026-09-14",
    comparisonEvidence: [KLAVIYO_EMAIL_USD_EVIDENCE],
  });
  assert.equal(result.traditionalDelivered, 200_000);
  assert.equal(result.deliberatelyLeftAlone, 40_000);
  assert.equal(result.controlCount, 24_000);
  assert.equal(result.joonDelivered, 136_000);
  assert.equal(result.campaignClicks, 5_440);
  assert.equal(result.campaignOrders, 109);
  assert.equal(result.recoveredJourneyOrders, 125);
  assert.equal(result.attributedRevenueMinor, 46_800_000);
  assert.equal(result.invoice.totalMinor, 2_340_000);
});

test("zero attributed revenue means zero fee without comparison evidence", () => {
  const invoice = computeAttributedInvoice({
    attributedRevenueMinor: 0,
    activeSubscribers: 10_000,
    monthlySends: 0,
    currency: "INR",
    subscriberSnapshotAt: "2026-09-14T00:00:00.000Z",
  });
  assert.equal(invoice.feeMinor, 0);
  assert.equal(invoice.totalMinor, 0);
  assert.equal(invoice.comparison, null);
});

test("positive attributed billing fails closed without approved cap evidence", () => {
  assert.throws(
    () =>
      computeAttributedInvoice({
        attributedRevenueMinor: 1_000_000,
        activeSubscribers: 10_000,
        monthlySends: 5_000,
        currency: "INR",
        subscriberSnapshotAt: "2026-09-14T00:00:00.000Z",
      }),
    /No verified klaviyo comparison price/
  );
});

test("the configured comparison cap binds attributed fees", () => {
  const invoice = computeAttributedInvoice({
    attributedRevenueMinor: 1_000_000_000,
    activeSubscribers: 50_000,
    monthlySends: 100_000,
    currency: "INR",
    subscriberSnapshotAt: "2026-09-14T00:00:00.000Z",
    comparisonEvidence: evidence,
  });
  assert.equal(invoice.capMinor, 4_800_000);
  assert.equal(invoice.feeMinor, 4_800_000);
});

test("causal proof remains available without entering the invoice path", () => {
  const caused = computeCaused([
    {
      stratum: "all",
      assignedTreated: 59_500,
      assignedControl: 10_500,
      treatedNetRevenueMinor: 23_800_000,
      controlNetRevenueMinor: 2_520_000,
    },
  ]);
  assert.equal(caused.causedMinor, 9_520_000);
});

test("comparison pricing uses the documented active-profile basis", () => {
  const result = comparisonPrice(
    "klaviyo",
    { currency: "INR", activeSubscribers: 50_000, monthlySends: 1 },
    evidence
  );
  assert.deepEqual(result.basis, { kind: "active_profiles", quantity: 50_000 });
});
