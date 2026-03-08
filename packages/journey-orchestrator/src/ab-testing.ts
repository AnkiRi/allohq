import { prisma } from "@allohq/database";
import type { ABTestVariable, ABTestResult, ABTestEvaluation } from "./types";

/**
 * Create a new A/B test for a journey or automation.
 */
export async function createTest(params: {
  storeId: string;
  automationId?: string;
  name: string;
  variable: ABTestVariable;
  variantA: { value: string; description: string };
  variantB: { value: string; description: string };
  splitRatio?: number;
  minSampleSize?: number;
}): Promise<string> {
  const test = await prisma.aBTest.create({
    data: {
      storeId: params.storeId,
      automationId: params.automationId,
      name: params.name,
      variable: params.variable,
      variantA: params.variantA,
      variantB: params.variantB,
      splitRatio: params.splitRatio ?? 0.5,
      minSampleSize: params.minSampleSize ?? 100,
    },
  });
  return test.id;
}

/**
 * Assign a variant for a customer in an A/B test.
 * Uses consistent hashing so same customer always gets same variant.
 */
export function assignVariant(
  testId: string,
  customerId: string,
  splitRatio: number = 0.5,
): "a" | "b" {
  // Simple hash-based assignment for consistency
  const hash = simpleHash(`${testId}:${customerId}`);
  return hash < splitRatio ? "a" : "b";
}

/**
 * Record the result of a message send in an A/B test.
 */
export async function recordResult(
  testId: string,
  variant: "a" | "b",
  event: "sent" | "opened" | "clicked" | "converted",
  revenue?: number,
): Promise<void> {
  const test = await prisma.aBTest.findUnique({
    where: { id: testId },
    select: { results: true, status: true },
  });

  if (!test || test.status !== "running") return;

  const results = (test.results ?? {}) as unknown as Record<string, ABTestResult>;
  const key = variant;
  const current = results[key] ?? {
    variant,
    sent: 0,
    opened: 0,
    clicked: 0,
    converted: 0,
    revenue: 0,
  };

  switch (event) {
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
      if (revenue) current.revenue += revenue;
      break;
  }

  results[key] = current;

  await prisma.aBTest.update({
    where: { id: testId },
    data: { results: JSON.parse(JSON.stringify(results)) },
  });
}

/**
 * Evaluate an A/B test and determine if there's a winner.
 */
export async function evaluateTest(testId: string): Promise<ABTestEvaluation> {
  const test = await prisma.aBTest.findUnique({
    where: { id: testId },
  });

  if (!test) {
    throw new Error(`A/B test ${testId} not found`);
  }

  const results = (test.results ?? {}) as unknown as Record<string, ABTestResult>;
  const aResults: ABTestResult = results["a"] ?? {
    variant: "a",
    sent: 0,
    opened: 0,
    clicked: 0,
    converted: 0,
    revenue: 0,
  };
  const bResults: ABTestResult = results["b"] ?? {
    variant: "b",
    sent: 0,
    opened: 0,
    clicked: 0,
    converted: 0,
    revenue: 0,
  };

  const totalSent = aResults.sent + bResults.sent;
  const ready = totalSent >= test.minSampleSize;

  if (!ready) {
    return {
      testId,
      winner: null,
      confidence: 0,
      aResults,
      bResults,
      ready: false,
    };
  }

  // Calculate conversion rates
  const aRate = aResults.sent > 0 ? aResults.clicked / aResults.sent : 0;
  const bRate = bResults.sent > 0 ? bResults.clicked / bResults.sent : 0;

  // Z-test for proportions
  const confidence = calculateConfidence(aRate, bRate, aResults.sent, bResults.sent);
  const winner = confidence >= 0.95 ? (aRate > bRate ? "a" : "b") : null;

  return {
    testId,
    winner,
    confidence,
    aResults,
    bResults,
    ready: true,
  };
}

/**
 * Conclude an A/B test with a winner.
 */
export async function concludeTest(
  testId: string,
  winner: "a" | "b",
  confidence: number,
): Promise<void> {
  await prisma.aBTest.update({
    where: { id: testId },
    data: {
      winner,
      confidence,
      status: "concluded",
      concludedAt: new Date(),
    },
  });
}

/**
 * List running A/B tests for a store.
 */
export async function listRunningTests(storeId: string) {
  return prisma.aBTest.findMany({
    where: { storeId, status: "running" },
    orderBy: { startedAt: "desc" },
  });
}

// ---- Helpers ----

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Normalize to 0-1
  return Math.abs(hash) / 2147483647;
}

function calculateConfidence(
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

  // Approximate p-value from z-score using normal CDF
  // Using Abramowitz & Stegun approximation
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

  return 1 - 2 * p; // two-tailed confidence
}
