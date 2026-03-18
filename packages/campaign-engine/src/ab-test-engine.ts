import { prisma } from "@allohq/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VariantStats {
  sent: number;
  opened: number;
  clicked: number;
  converted: number;
  revenue: number;
  conversionRate: number;
  clickRate: number;
  openRate: number;
  avgValue: number;
}

export interface TestResults {
  testId: string;
  name: string;
  variable: string;
  status: string;
  variantA: VariantStats;
  variantB: VariantStats;
  winner: "a" | "b" | null;
  confidence: number;
  significanceReached: boolean;
  sampleSizeMet: boolean;
  startedAt: Date | null;
  concludedAt: Date | null;
}

export interface EvaluationOutcome {
  testId: string;
  winner: "a" | "b" | null;
  confidence: number;
  significanceReached: boolean;
  sampleSizeMet: boolean;
  autoConcluded: boolean;
  variantA: VariantStats;
  variantB: VariantStats;
}

// ---------------------------------------------------------------------------
// 1. assignVariant — deterministic hash-based assignment
// ---------------------------------------------------------------------------

/**
 * Deterministically assign a customer to variant A or B for a given test.
 * Uses a hash of testId + customerId so the same customer always gets the
 * same variant. Respects the test's traffic split ratio.
 */
export function assignVariant(
  testId: string,
  customerId: string,
  splitRatio: number = 0.5,
): "a" | "b" {
  const hash = deterministicHash(`${testId}:${customerId}`);
  return hash < splitRatio ? "a" : "b";
}

// ---------------------------------------------------------------------------
// 2. recordConversion — record a conversion event against a variant
// ---------------------------------------------------------------------------

/**
 * Record a conversion event for a specific variant in an A/B test.
 * Supports events: sent, opened, clicked, converted.
 * For "converted" events, an optional revenue value can be provided.
 */
export async function recordConversion(
  testId: string,
  variant: "a" | "b",
  metric: "sent" | "opened" | "clicked" | "converted",
  value?: number,
): Promise<void> {
  const test = await prisma.aBTest.findUnique({
    where: { id: testId },
    select: { results: true, status: true },
  });

  if (!test || test.status !== "running") return;

  const results = (test.results ?? {}) as unknown as Record<string, RawVariantResult>;
  const current: RawVariantResult = results[variant] ?? {
    variant,
    sent: 0,
    opened: 0,
    clicked: 0,
    converted: 0,
    revenue: 0,
  };

  switch (metric) {
    case "sent":
      current.sent++;
      break;
    case "opened":
      current.opened++;
      break;
    case "clicked":
      current.clicked++;
      break;
    case "converted":
      current.converted++;
      if (value) current.revenue += value;
      break;
  }

  results[variant] = current;

  await prisma.aBTest.update({
    where: { id: testId },
    data: { results: JSON.parse(JSON.stringify(results)) },
  });
}

// ---------------------------------------------------------------------------
// 3. evaluateTest — full statistical evaluation with auto-conclude
// ---------------------------------------------------------------------------

/**
 * Evaluate a running A/B test:
 *  - Compute per-variant stats (sample size, conversion rate, avg value)
 *  - Run z-test for proportions to get statistical significance
 *  - Determine winner when confidence >= 95%
 *  - Auto-conclude the test if significance reached OR both variants
 *    have met the minimum sample size and a winner is clear
 */
export async function evaluateTest(testId: string): Promise<EvaluationOutcome> {
  const test = await prisma.aBTest.findUnique({ where: { id: testId } });
  if (!test) throw new Error(`A/B test ${testId} not found`);

  const results = (test.results ?? {}) as unknown as Record<string, RawVariantResult>;

  const aRaw = results["a"] ?? emptyResult("a");
  const bRaw = results["b"] ?? emptyResult("b");

  const variantA = computeStats(aRaw);
  const variantB = computeStats(bRaw);

  const totalSent = aRaw.sent + bRaw.sent;
  const sampleSizeMet = totalSent >= test.minSampleSize;

  // Need minimum samples in EACH variant for a fair comparison
  const bothHaveData = aRaw.sent >= 10 && bRaw.sent >= 10;

  let confidence = 0;
  let winner: "a" | "b" | null = null;

  if (sampleSizeMet && bothHaveData) {
    // Z-test on click rates (primary metric)
    confidence = calculateZTestConfidence(
      variantA.clickRate / 100,
      variantB.clickRate / 100,
      aRaw.sent,
      bRaw.sent,
    );

    if (confidence >= 0.95) {
      winner =
        variantA.clickRate > variantB.clickRate ? "a" : "b";
    }
  }

  const significanceReached = confidence >= 0.95;

  // Auto-conclude if significance reached and test is still running
  let autoConcluded = false;
  if (test.status === "running" && significanceReached && winner) {
    await prisma.aBTest.update({
      where: { id: testId },
      data: {
        winner,
        confidence,
        status: "concluded",
        concludedAt: new Date(),
      },
    });
    autoConcluded = true;
  }

  return {
    testId,
    winner,
    confidence,
    significanceReached,
    sampleSizeMet,
    autoConcluded,
    variantA,
    variantB,
  };
}

// ---------------------------------------------------------------------------
// 4. getTestResults — return current stats for UI display
// ---------------------------------------------------------------------------

/**
 * Fetch current results for an A/B test, formatted for display.
 */
export async function getTestResults(testId: string): Promise<TestResults> {
  const test = await prisma.aBTest.findUnique({ where: { id: testId } });
  if (!test) throw new Error(`A/B test ${testId} not found`);

  const results = (test.results ?? {}) as unknown as Record<string, RawVariantResult>;

  const aRaw = results["a"] ?? emptyResult("a");
  const bRaw = results["b"] ?? emptyResult("b");

  const variantA = computeStats(aRaw);
  const variantB = computeStats(bRaw);

  const totalSent = aRaw.sent + bRaw.sent;
  const sampleSizeMet = totalSent >= test.minSampleSize;

  const bothHaveData = aRaw.sent >= 10 && bRaw.sent >= 10;
  let confidence = 0;

  if (sampleSizeMet && bothHaveData) {
    confidence = calculateZTestConfidence(
      variantA.clickRate / 100,
      variantB.clickRate / 100,
      aRaw.sent,
      bRaw.sent,
    );
  }

  return {
    testId,
    name: test.name,
    variable: test.variable,
    status: test.status,
    variantA,
    variantB,
    winner: (test.winner as "a" | "b") ?? null,
    confidence: test.confidence ?? confidence,
    significanceReached: (test.confidence ?? confidence) >= 0.95,
    sampleSizeMet,
    startedAt: test.startedAt,
    concludedAt: test.concludedAt,
  };
}

// ---------------------------------------------------------------------------
// 5. getActiveTestForAutomation — find a running test for an automation
// ---------------------------------------------------------------------------

/**
 * Find a running A/B test for a given automation. Returns null if none.
 */
export async function getActiveTestForAutomation(
  automationId: string,
): Promise<{ id: string; variable: string; splitRatio: number } | null> {
  const test = await prisma.aBTest.findFirst({
    where: { automationId, status: "running" },
    select: { id: true, variable: true, splitRatio: true },
  });
  return test;
}

/**
 * Find a running A/B test for a given store, optionally filtering by variable.
 * Useful for campaigns that are not linked to an automation.
 */
export async function getActiveTestForStore(
  storeId: string,
  variable?: string,
): Promise<{ id: string; variable: string; splitRatio: number; variantA: unknown; variantB: unknown } | null> {
  const where: Record<string, unknown> = { storeId, status: "running" };
  if (variable) where["variable"] = variable;

  const test = await prisma.aBTest.findFirst({
    where,
    select: { id: true, variable: true, splitRatio: true, variantA: true, variantB: true },
  });
  return test;
}

/**
 * List all running A/B tests across all stores (for cron evaluation).
 */
export async function listAllRunningTests(): Promise<
  Array<{ id: string; storeId: string; name: string; minSampleSize: number }>
> {
  return prisma.aBTest.findMany({
    where: { status: "running" },
    select: { id: true, storeId: true, name: true, minSampleSize: true },
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RawVariantResult {
  variant: "a" | "b";
  sent: number;
  opened: number;
  clicked: number;
  converted: number;
  revenue: number;
}

function emptyResult(variant: "a" | "b"): RawVariantResult {
  return { variant, sent: 0, opened: 0, clicked: 0, converted: 0, revenue: 0 };
}

function computeStats(raw: RawVariantResult): VariantStats {
  return {
    sent: raw.sent,
    opened: raw.opened,
    clicked: raw.clicked,
    converted: raw.converted,
    revenue: raw.revenue,
    openRate: raw.sent > 0 ? Math.round((raw.opened / raw.sent) * 10000) / 100 : 0,
    clickRate: raw.sent > 0 ? Math.round((raw.clicked / raw.sent) * 10000) / 100 : 0,
    conversionRate: raw.sent > 0 ? Math.round((raw.converted / raw.sent) * 10000) / 100 : 0,
    avgValue: raw.converted > 0 ? Math.round((raw.revenue / raw.converted) * 100) / 100 : 0,
  };
}

/**
 * Deterministic hash that maps a string to a float in [0, 1).
 * Same input always yields the same output.
 */
function deterministicHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Normalize to [0, 1)
  return Math.abs(hash) / 2147483647;
}

/**
 * Two-proportion z-test.
 * Returns the confidence level (0 to 1) that the two rates are different.
 * Uses the Abramowitz & Stegun normal CDF approximation.
 */
function calculateZTestConfidence(
  rateA: number,
  rateB: number,
  nA: number,
  nB: number,
): number {
  if (nA === 0 || nB === 0) return 0;

  const pooled = (rateA * nA + rateB * nB) / (nA + nB);
  if (pooled === 0 || pooled === 1) return 0;

  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));
  if (se === 0) return 0;

  const z = Math.abs(rateA - rateB) / se;

  // Abramowitz & Stegun approximation for normal CDF
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

  return 1 - 2 * p; // two-tailed confidence
}
