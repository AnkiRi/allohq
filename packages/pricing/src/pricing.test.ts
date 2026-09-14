import assert from "node:assert/strict";
import test from "node:test";
import {
  KLAVIYO_EMAIL_USD_EVIDENCE,
  PRICING_CONFIG,
  comparisonPrice,
  computeCalculatorScenario,
  computeCaused,
  computeMonthlyInvoice,
  deriveMonthlyRevenueMinor,
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
  {
    tool: "klaviyo",
    model: "active_profiles",
    currency: "USD",
    tiers: [{ upTo: 100_000, priceMinor: 100_000 }],
    sourceUrl: "https://example.test/private-klaviyo-evidence",
    sourcedAt: "2026-09-10",
    evidenceStatus: "private_unapproved",
  },
  {
    tool: "shopify_email",
    model: "monthly_sends_progressive",
    currency: "USD",
    bands: [
      { upTo: 10_000, pricePerThousandMinor: 0 },
      { upTo: 300_000, pricePerThousandMinor: 100 },
      { upTo: 750_000, pricePerThousandMinor: 65 },
      { upTo: null, pricePerThousandMinor: 55 },
    ],
    sourceUrl: "https://example.test/shopify-email-evidence",
    sourcedAt: "2026-09-10",
    evidenceStatus: "public_approved",
  },
];

function unit(causedMinor: number) {
  return {
    unitType: "campaign" as const,
    unitId: "campaign-1",
    causedMinor,
    tier: "measurement_ready" as const,
    overlapsAnotherUnit: false,
  };
}

test("reference treatment/control case causes ₹95,200 and a ₹19,040 fee", () => {
  const caused = computeCaused([{
    stratum: "all",
    assignedTreated: 59_500,
    assignedControl: 10_500,
    treatedNetRevenueMinor: 23_800_000,
    controlNetRevenueMinor: 2_520_000,
  }]);
  assert.equal(caused.causedMinor, 9_520_000);
  const invoice = computeMonthlyInvoice({
    units: [unit(caused.causedMinor)],
    carryInMinor: 0,
    postageEmails: 0,
    activeSubscribers: 70_000,
    monthlySends: 0,
    currency: "INR",
    subscriberSnapshotAt: "2026-09-10T00:00:00.000Z",
    comparisonEvidence: evidence,
  });
  assert.equal(invoice.uncappedPerformanceFeeMinor, 1_904_000);
  assert.equal(invoice.liftFeeMinor, 1_904_000);
  assert.equal(invoice.totalMinor, 1_904_000);
});

test("zero effect produces no performance fee", () => {
  const caused = computeCaused([{
    stratum: "champions",
    assignedTreated: 100,
    assignedControl: 100,
    treatedNetRevenueMinor: 50_000,
    controlNetRevenueMinor: 50_000,
  }]);
  assert.equal(caused.causedMinor, 0);
});

test("negative net carries forward and is never charged", () => {
  const invoice = computeMonthlyInvoice({
    units: [unit(80_000)],
    carryInMinor: -100_000,
    postageEmails: 0,
    activeSubscribers: 10_000,
    monthlySends: 0,
    currency: "INR",
    subscriberSnapshotAt: "2026-09-10T00:00:00.000Z",
    comparisonEvidence: evidence,
  });
  assert.equal(invoice.carryOutMinor, -20_000);
  assert.equal(invoice.liftFeeMinor, 0);
});

test("the cap covers the whole bill, so postage can push the fee to zero", () => {
  const cappedEvidence: ComparisonPriceEvidence[] = [{
    tool: "klaviyo",
    model: "active_profiles",
    currency: "INR",
    tiers: [{ upTo: null, priceMinor: 10_000 }],
    sourceUrl: "https://example.test/private-klaviyo-evidence",
    sourcedAt: "2026-09-10",
    evidenceStatus: "private_unapproved",
  }];
  const invoice = computeMonthlyInvoice({
    units: [unit(1_000_000)],
    carryInMinor: 0,
    postageEmails: 70_000,
    activeSubscribers: 70_000,
    monthlySends: 70_000,
    currency: "INR",
    subscriberSnapshotAt: "2026-09-10T00:00:00.000Z",
    comparisonEvidence: cappedEvidence,
  });
  // Postage is passed through at cost and is never reduced by the cap, so a
  // cap smaller than postage simply leaves no room for a fee. The cap is 80%
  // of the benchmark, so ₹100 of evidence yields an ₹80 ceiling.
  assert.equal(invoice.performanceFeeCapMinor, 8_000);
  assert.equal(invoice.postageMinor, 63_000);
  assert.equal(invoice.liftFeeMinor, 0);
  assert.equal(invoice.totalMinor, 63_000);
});

test("postage-only months work in INR and USD", () => {
  const common = {
    units: [] as const,
    carryInMinor: 0,
    postageEmails: 10_000,
    activeSubscribers: 10_000,
    monthlySends: 10_000,
    subscriberSnapshotAt: "2026-09-10T00:00:00.000Z",
  };
  const inr = computeMonthlyInvoice({ ...common, currency: "INR" });
  const usd = computeMonthlyInvoice({ ...common, currency: "USD" });
  assert.equal(inr.postageMinor, 9_000);
  assert.equal(usd.postageMinor, 100);
  assert.equal(inr.totalMinor, inr.postageMinor);
  assert.equal(usd.totalMinor, usd.postageMinor);
  assert.equal(inr.performanceFeeCapMinor, null);
  assert.equal(inr.performanceFeeCapStatus, "not_required");
  assert.equal(inr.comparison, null);
});

test("only non-overlapping measurement-ready campaigns are billable", () => {
  const invoice = computeMonthlyInvoice({
    units: [
      unit(100_000),
      { ...unit(200_000), unitId: "overlap", overlapsAnotherUnit: true },
      { ...unit(300_000), unitId: "small", tier: "directional" },
      { ...unit(400_000), unitId: "journey", unitType: "journey" },
    ],
    carryInMinor: 0,
    postageEmails: 0,
    activeSubscribers: 10_000,
    monthlySends: 0,
    currency: "INR",
    subscriberSnapshotAt: "2026-09-10T00:00:00.000Z",
    comparisonEvidence: evidence,
  });
  assert.equal(invoice.billableCausedMinor, 100_000);
});

test("Shopify comparison uses sends while Klaviyo uses active profiles", () => {
  const shopify = comparisonPrice("shopify_email", {
    currency: "USD",
    activeSubscribers: 1_000,
    monthlySends: 400_000,
    publicDisplay: true,
  }, evidence);
  assert.deepEqual(shopify.basis, { kind: "monthly_sends", quantity: 400_000 });
  assert.throws(() => comparisonPrice("klaviyo", {
    currency: "INR",
    activeSubscribers: 70_000,
    monthlySends: 1,
    publicDisplay: true,
  }, evidence), /not approved for public display/);
});

test("official Shopify Email progressive pricing charges $270 for 280k sends", () => {
  const shopify = comparisonPrice("shopify_email", {
    currency: "USD",
    activeSubscribers: 70_000,
    monthlySends: 280_000,
    publicDisplay: true,
  });
  assert.equal(shopify.priceMinor, 27_000);
  const inr = comparisonPrice("shopify_email", {
    currency: "INR",
    activeSubscribers: 70_000,
    monthlySends: 280_000,
    publicDisplay: true,
  });
  assert.equal(inr.priceMinor, 2_295_000);
  assert.equal(inr.derivedFromCurrency, "USD");
  assert.equal(inr.fxVersion, PRICING_CONFIG.version);
});

test("public calculator cap evidence caps the displayed Joon total", () => {
  const scenario = computeCalculatorScenario({
    activeSubscribers: 70_000,
    monthlyRevenueMinor: 150_000_000,
    emailRevenueShareBasisPoints: 2_000,
    causedShareBasisPoints: 4_000,
    merchantBlastCount: 4,
    currency: "INR",
    comparisonTool: "klaviyo",
    traditionalComparisonEvidence: [KLAVIYO_EMAIL_USD_EVIDENCE],
    calculatorCapEvidence: [KLAVIYO_EMAIL_USD_EVIDENCE],
    subscriberSnapshotAt: "2026-09-13T00:00:00.000Z",
  });
  assert.equal(scenario.traditional.priceMinor, 8_500_000);
  assert.equal(scenario.invoice.performanceFeeCapStatus, "available");
  assert.equal(scenario.invoice.totalMinor, 2_652_000);
  assert.ok(scenario.invoice.totalMinor <= scenario.traditional.priceMinor);
});

test("the capped total lands below the benchmark, postage included", () => {
  const scenario = computeCalculatorScenario({
    activeSubscribers: 10_000,
    monthlyRevenueMinor: 150_000_000,
    emailRevenueShareBasisPoints: 2_000,
    causedShareBasisPoints: 4_000,
    merchantBlastCount: 4,
    currency: "INR",
    comparisonTool: "klaviyo",
    traditionalComparisonEvidence: [KLAVIYO_EMAIL_USD_EVIDENCE],
    calculatorCapEvidence: [KLAVIYO_EMAIL_USD_EVIDENCE],
    subscriberSnapshotAt: "2026-09-13T00:00:00.000Z",
  });
  assert.equal(scenario.traditional.priceMinor, 1_275_000);
  // The fee yields to postage so that fee + postage lands on the cap, rather
  // than the fee alone matching it and the bill exceeding it. The cap is 80%
  // of the benchmark, so the bill stays strictly below what it replaces.
  assert.equal(scenario.invoice.postageMinor, 36_000);
  assert.equal(scenario.invoice.liftFeeMinor, 984_000);
  assert.equal(scenario.invoice.totalMinor, 1_020_000);
  assert.ok(scenario.invoice.totalMinor < scenario.traditional.priceMinor);
});

test("the bill stays strictly under the benchmark at every slider position", () => {
  // The promise is that Joon costs less than the platform it replaces. Parity
  // rendered two identical figures and read as a fault, so the cap sits below
  // the benchmark rather than on it.
  for (const subscribers of [1_000, 10_000, 70_000, 150_000]) {
    for (const emailShare of [5, 40]) {
      for (const causedShare of [0, 70]) {
        for (const merchantBlastCount of [0, 31]) {
          const scenario = computeCalculatorScenario({
            activeSubscribers: subscribers,
            monthlyRevenueMinor: deriveMonthlyRevenueMinor(subscribers, "INR"),
            emailRevenueShareBasisPoints: emailShare * 100,
            causedShareBasisPoints: causedShare * 100,
            merchantBlastCount,
            currency: "INR",
            comparisonTool: "klaviyo",
            traditionalComparisonEvidence: [KLAVIYO_EMAIL_USD_EVIDENCE],
            calculatorCapEvidence: [KLAVIYO_EMAIL_USD_EVIDENCE],
            subscriberSnapshotAt: "2026-09-14T00:00:00.000Z",
          });
          assert.ok(
            scenario.invoice.totalMinor < scenario.traditional.priceMinor,
            `${subscribers} subscribers, ${emailShare}% email, ${causedShare}% caused, ${merchantBlastCount} blasts: ${scenario.invoice.totalMinor} should be under ${scenario.traditional.priceMinor}`,
          );
        }
      }
    }
  }
});

test("revenue is derived from list size so the two inputs cannot contradict", () => {
  assert.equal(deriveMonthlyRevenueMinor(70_000, "INR"), 168_000_000);
  assert.equal(deriveMonthlyRevenueMinor(150_000, "INR"), 360_000_000);
  assert.equal(deriveMonthlyRevenueMinor(70_000, "USD"), 1_680_000);
  assert.equal(deriveMonthlyRevenueMinor(0, "INR"), 0);
});

test("the benchmark refuses list sizes it has no published price for", () => {
  const atCeiling = comparisonPrice("klaviyo", {
    currency: "INR",
    activeSubscribers: 150_000,
    monthlySends: 0,
    publicDisplay: true,
  }, [KLAVIYO_EMAIL_USD_EVIDENCE]);
  assert.equal(atCeiling.priceMinor, 16_617_500);
  // Beyond the published table there is no honest number to quote, so the
  // estimator fails closed instead of repeating a starting price.
  assert.throws(() => comparisonPrice("klaviyo", {
    currency: "INR",
    activeSubscribers: 150_001,
    monthlySends: 0,
    publicDisplay: true,
  }, [KLAVIYO_EMAIL_USD_EVIDENCE]), /does not cover/);
});

test("at the comparable ceiling the derived scenario stays well under the benchmark", () => {
  const scenario = computeCalculatorScenario({
    activeSubscribers: 150_000,
    monthlyRevenueMinor: deriveMonthlyRevenueMinor(150_000, "INR"),
    emailRevenueShareBasisPoints: 2_000,
    causedShareBasisPoints: 4_000,
    merchantBlastCount: 4,
    currency: "INR",
    comparisonTool: "klaviyo",
    traditionalComparisonEvidence: [KLAVIYO_EMAIL_USD_EVIDENCE],
    calculatorCapEvidence: [KLAVIYO_EMAIL_USD_EVIDENCE],
    subscriberSnapshotAt: "2026-09-13T00:00:00.000Z",
  });
  assert.equal(scenario.traditional.priceMinor, 16_617_500);
  assert.equal(scenario.invoice.liftFeeMinor, 5_760_000);
  assert.equal(scenario.invoice.postageMinor, 540_000);
  assert.equal(scenario.invoice.totalMinor, 6_300_000);
  assert.ok(scenario.invoice.totalMinor < scenario.traditional.priceMinor);
});

test("a positive performance fee fails closed without approved cap evidence", () => {
  assert.throws(() => computeMonthlyInvoice({
    units: [unit(100_000)],
    carryInMinor: 0,
    postageEmails: 0,
    activeSubscribers: 10_000,
    monthlySends: 0,
    currency: "INR",
    subscriberSnapshotAt: "2026-09-11T00:00:00.000Z",
  }), /No verified klaviyo comparison price/);
});

test("uncapped estimation is available only through the explicit preview flag", () => {
  const invoice = computeMonthlyInvoice({ units: [unit(100_000)], carryInMinor: 0, postageEmails: 1_000, activeSubscribers: 10_000, monthlySends: 1_000, currency: "INR", subscriberSnapshotAt: "2026-09-11T00:00:00.000Z", allowUncappedPreview: true });
  assert.equal(invoice.performanceFeeCapStatus, "unavailable_preview");
  assert.equal(invoice.calculationKind, "uncapped_preview");
  assert.equal(invoice.liftFeeMinor, 20_000);
  assert.equal(invoice.totalMinor, 20_900);
});

test("calculator and invoice paths have exact parity", () => {
  const scenario = computeCalculatorScenario({
    activeSubscribers: 70_000,
    monthlyRevenueMinor: 150_000_000,
    emailRevenueShareBasisPoints: 2_000,
    causedShareBasisPoints: 4_000,
    merchantBlastCount: 4,
    currency: "INR",
    comparisonTool: "klaviyo",
    comparisonEvidence: evidence,
    subscriberSnapshotAt: "2026-09-10T00:00:00.000Z",
  });
  const direct = computeMonthlyInvoice({
    units: [unit(scenario.causedMinor)],
    carryInMinor: 0,
    postageEmails: 280_000,
    activeSubscribers: 70_000,
    monthlySends: 280_000,
    currency: "INR",
    subscriberSnapshotAt: "2026-09-10T00:00:00.000Z",
    comparisonEvidence: evidence,
  });
  assert.deepEqual(scenario.invoice, direct);
  assert.equal(scenario.invoice.pricingVersion, PRICING_CONFIG.version);
  assert.equal(scenario.invoice.pricingMetadata.postageSourcedAt, "2026-09-10");
  assert.equal(scenario.invoice.comparison?.sourcedAt, "2026-09-10");
});

test("calculator accepts a merchant-entered current bill without using it as the cap", () => {
  const scenario = computeCalculatorScenario({
    activeSubscribers: 70_000,
    monthlyRevenueMinor: 10_000_000,
    emailRevenueShareBasisPoints: 2_000,
    causedShareBasisPoints: 4_000,
    merchantBlastCount: 4,
    currency: "INR",
    comparisonTool: "klaviyo",
    enteredBillMinor: 123_456,
    comparisonEvidence: evidence,
    subscriberSnapshotAt: "2026-09-10T00:00:00.000Z",
  });
  assert.equal(scenario.traditional.priceMinor, 123_456);
  // The cap still comes from published evidence at 80%, never from the figure
  // the merchant typed.
  assert.equal(scenario.invoice.performanceFeeCapMinor, 4_800_000);
});

test("calculator computes the uncapped break-even in the pricing module", () => {
  const scenario = computeCalculatorScenario({
    activeSubscribers: 70_000,
    monthlyRevenueMinor: 150_000_000,
    emailRevenueShareBasisPoints: 2_000,
    causedShareBasisPoints: 4_000,
    merchantBlastCount: 4,
    currency: "INR",
    comparisonTool: "shopify_email",
    subscriberSnapshotAt: "2026-09-11T00:00:00.000Z",
  });
  assert.equal(scenario.breakEven.costsMoreAtZeroLift, false);
  assert.equal(scenario.breakEven.causedMinor, 10_215_002);
  assert.equal(scenario.breakEven.merchantKeepsMinor, 8_172_002);
  assert.equal(scenario.breakEven.currentlyCostsMore, true);
});

test("calculator calls out when postage alone exceeds the comparison", () => {
  const scenario = computeCalculatorScenario({
    activeSubscribers: 70_000,
    monthlyRevenueMinor: 0,
    emailRevenueShareBasisPoints: 2_000,
    causedShareBasisPoints: 0,
    merchantBlastCount: 4,
    currency: "INR",
    comparisonTool: "shopify_email",
    enteredBillMinor: 100,
    subscriberSnapshotAt: "2026-09-11T00:00:00.000Z",
  });
  assert.equal(scenario.breakEven.costsMoreAtZeroLift, true);
  assert.equal(scenario.breakEven.causedMinor, 0);
  assert.equal(scenario.breakEven.currentlyCostsMore, true);
});
