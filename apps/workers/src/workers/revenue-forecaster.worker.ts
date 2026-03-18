import { Worker } from "bullmq";
import type { Job } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";

interface ForecastJobData {
  storeId?: string;
  type?: string;
}

/**
 * Revenue Forecaster Worker (Sprint 14.4)
 * Daily job: generates 7-day revenue forecasts per store using:
 *   - Moving average baseline
 *   - Linear regression trend
 *   - Day-of-week seasonal multipliers
 *   - Monthly pattern adjustments (beginning vs end of month)
 *   - Active campaign/automation factor
 *   - Confidence interval that grows with forecast horizon
 *
 * Also runs an accuracy updater that backfills yesterday's actual revenue
 * against past forecasts.
 */
export const revenueForecastWorker = new Worker<ForecastJobData>(
  QUEUE_NAMES.REVENUE_FORECAST,
  async (job: Job<ForecastJobData>) => {
    // If a specific storeId is given, forecast just that store
    if (job.data.storeId) {
      await generateStoreForecast(job.data.storeId);
      return;
    }

    // Otherwise: cron mode — forecast all active stores + update accuracy
    console.log("[RevenueForecast] Running daily forecast for all active stores");

    const stores = await prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, shopDomain: true },
    });

    console.log(`[RevenueForecast] Found ${stores.length} active stores`);

    for (const store of stores) {
      try {
        await generateStoreForecast(store.id);
      } catch (err) {
        console.error(
          `[RevenueForecast] Error for store ${store.shopDomain}:`,
          (err as Error).message
        );
      }
    }

    // After generating new forecasts, update accuracy on past forecasts
    await updateForecastAccuracy();

    console.log("[RevenueForecast] Daily run complete");
  },
  { connection: redisConnection }
);

// ---------------------------------------------------------------------------
// Core forecast generation
// ---------------------------------------------------------------------------

async function generateStoreForecast(storeId: string): Promise<void> {
  console.log(`[RevenueForecast] Generating forecast for store ${storeId}`);

  // 1. Fetch last 90 days of daily revenue
  const since = new Date(Date.now() - 90 * 86400000);
  const dailyRevenue = await prisma.$queryRaw<
    Array<{ date: string; revenue: number; orders: number }>
  >`
    SELECT
      DATE_TRUNC('day', "createdAt")::date::text AS date,
      COALESCE(SUM("totalPrice"), 0)::float AS revenue,
      COUNT(*)::int AS orders
    FROM orders
    WHERE "storeId" = ${storeId}
      AND "createdAt" >= ${since}
    GROUP BY DATE_TRUNC('day', "createdAt")
    ORDER BY date ASC
  `;

  if (dailyRevenue.length < 7) {
    console.log(
      `[RevenueForecast] Insufficient data (${dailyRevenue.length} days) for store ${storeId}`
    );
    return;
  }

  const revenueValues = dailyRevenue.map((d) => d.revenue);
  const daysWithData = revenueValues.length;

  // 2. Calculate baseline: average daily revenue
  const totalRevenue = revenueValues.reduce((s, v) => s + v, 0);
  const avgDaily = totalRevenue / daysWithData;

  // 3. Calculate trend via linear regression on last 30 days
  const recent30 = revenueValues.slice(-30);
  const firstWeekAvg =
    recent30.slice(0, 7).reduce((s, v) => s + v, 0) /
    Math.min(7, recent30.length);
  const lastWeekAvg =
    recent30.slice(-7).reduce((s, v) => s + v, 0) /
    Math.min(7, recent30.length);
  const weeksOfData = Math.max(1, recent30.length / 7);
  const weeklyTrend = (lastWeekAvg - firstWeekAvg) / weeksOfData;
  const dailyTrend = linearTrend(recent30);

  // 4. Day-of-week multipliers (0=Sun, 1=Mon, ..., 6=Sat)
  const dowTotals: number[] = [0, 0, 0, 0, 0, 0, 0];
  const dowCounts: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dailyRevenue) {
    const dow = new Date(d.date).getUTCDay();
    dowTotals[dow] = (dowTotals[dow] ?? 0) + d.revenue;
    dowCounts[dow] = (dowCounts[dow] ?? 0) + 1;
  }
  const dowAvg = dowTotals.map((total, i) =>
    dowCounts[i]! > 0 ? total / dowCounts[i]! : avgDaily
  );
  const dowMultiplier = dowAvg.map((a) => (avgDaily > 0 ? a / avgDaily : 1));

  // 5. Monthly pattern: beginning (days 1-10), middle (11-20), end (21-31)
  const monthBuckets = { beginning: 0, middle: 0, end: 0 };
  const monthBucketCounts = { beginning: 0, middle: 0, end: 0 };
  for (const d of dailyRevenue) {
    const dayOfMonth = new Date(d.date).getUTCDate();
    if (dayOfMonth <= 10) {
      monthBuckets.beginning += d.revenue;
      monthBucketCounts.beginning += 1;
    } else if (dayOfMonth <= 20) {
      monthBuckets.middle += d.revenue;
      monthBucketCounts.middle += 1;
    } else {
      monthBuckets.end += d.revenue;
      monthBucketCounts.end += 1;
    }
  }
  const monthAvgs = {
    beginning:
      monthBucketCounts.beginning > 0
        ? monthBuckets.beginning / monthBucketCounts.beginning
        : avgDaily,
    middle:
      monthBucketCounts.middle > 0
        ? monthBuckets.middle / monthBucketCounts.middle
        : avgDaily,
    end:
      monthBucketCounts.end > 0
        ? monthBuckets.end / monthBucketCounts.end
        : avgDaily,
  };
  function monthMultiplier(dayOfMonth: number): number {
    const bucket =
      dayOfMonth <= 10
        ? monthAvgs.beginning
        : dayOfMonth <= 20
          ? monthAvgs.middle
          : monthAvgs.end;
    return avgDaily > 0 ? bucket / avgDaily : 1;
  }

  // 6. Factor in active automations/campaigns (small boost for active ones)
  const activeCampaigns = await prisma.campaign.count({
    where: { storeId, status: { in: ["sending", "scheduled"] } },
  });
  const activeAutomations = await prisma.automation.count({
    where: { storeId, status: "active" },
  });
  // Each active campaign adds a 2% boost, each automation 1%, capped at 20%
  const campaignBoost = Math.min(
    0.2,
    activeCampaigns * 0.02 + activeAutomations * 0.01
  );

  // 7. Confidence: more data = higher confidence
  const baseConfidence = Math.min(0.95, 0.5 + daysWithData / 180);

  // 8. Volatility for confidence interval width
  const stdDev = standardDeviation(recent30);
  const volatility = avgDaily > 0 ? stdDev / avgDaily : 0.3;

  // 9. Generate 7-day forecast and store in DB
  const now = new Date();
  const forecasts: Array<{
    forecastDate: Date;
    predicted: number;
    lower: number;
    upper: number;
    confidence: number;
  }> = [];

  for (let i = 1; i <= 7; i++) {
    const targetDate = new Date(now.getTime() + i * 86400000);
    const targetDow = targetDate.getUTCDay();
    const targetDom = targetDate.getUTCDate();
    const weeksAhead = i / 7;

    // Combine: base + trend + day-of-week + month pattern + campaign boost
    const base = avgDaily + weeklyTrend * weeksAhead;
    const dowFactor = dowMultiplier[targetDow] ?? 1;
    const monthFactor = monthMultiplier(targetDom);
    // Average the two seasonal factors to avoid double-counting
    const seasonalFactor = (dowFactor + monthFactor) / 2;
    const predicted = Math.max(0, base * seasonalFactor * (1 + campaignBoost));

    // Confidence interval widens with horizon and volatility
    const uncertainty = volatility * avgDaily * Math.sqrt(i / 7);
    const confidence = Math.max(0.3, baseConfidence - i * 0.02);

    forecasts.push({
      forecastDate: new Date(targetDate.toISOString().split("T")[0]!),
      predicted: round2(predicted),
      lower: round2(Math.max(0, predicted - uncertainty)),
      upper: round2(predicted + uncertainty),
      confidence: round4(confidence),
    });
  }

  // 10. Upsert each day's forecast into the database
  for (const f of forecasts) {
    await prisma.revenueForecast.upsert({
      where: {
        storeId_forecastDate: {
          storeId,
          forecastDate: f.forecastDate,
        },
      },
      create: {
        storeId,
        forecastDate: f.forecastDate,
        predicted: f.predicted,
        lower: f.lower,
        upper: f.upper,
        confidence: f.confidence,
      },
      update: {
        predicted: f.predicted,
        lower: f.lower,
        upper: f.upper,
        confidence: f.confidence,
      },
    });
  }

  // 11. Also store summary in messagingConfig for backward compat
  const existingConfig = await getExistingConfig(storeId);
  await prisma.store.update({
    where: { id: storeId },
    data: {
      messagingConfig: {
        ...existingConfig,
        revenueForecast: JSON.parse(
          JSON.stringify({
            forecast7d: forecasts.map((f) => ({
              date: f.forecastDate.toISOString().split("T")[0],
              projected: f.predicted,
              lower: f.lower,
              upper: f.upper,
            })),
            generatedAt: now.toISOString(),
            metrics: {
              avgDaily: round2(avgDaily),
              weeklyTrend: round2(weeklyTrend),
              dailyTrend: round2(dailyTrend),
              volatility: round4(volatility),
              campaignBoost: round4(campaignBoost),
              confidence: round4(baseConfidence),
              daysOfData: daysWithData,
            },
          })
        ),
      },
    },
  });

  console.log(
    `[RevenueForecast] Complete for ${storeId}: avg=₹${avgDaily.toFixed(0)}, trend=${weeklyTrend > 0 ? "+" : ""}₹${weeklyTrend.toFixed(0)}/wk, confidence=${(baseConfidence * 100).toFixed(0)}%`
  );
}

// ---------------------------------------------------------------------------
// Accuracy updater: compare yesterday's forecast with actual revenue
// ---------------------------------------------------------------------------

async function updateForecastAccuracy(): Promise<void> {
  console.log("[RevenueForecast] Updating forecast accuracy for past dates");

  // Find forecasts where actual is null and forecastDate is in the past
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const pendingForecasts = await prisma.revenueForecast.findMany({
    where: {
      actual: null,
      forecastDate: { lte: yesterday },
    },
    select: { id: true, storeId: true, forecastDate: true, predicted: true },
  });

  if (pendingForecasts.length === 0) {
    console.log("[RevenueForecast] No forecasts to update accuracy for");
    return;
  }

  // Group by storeId to batch queries
  const byStore = new Map<string, typeof pendingForecasts>();
  for (const f of pendingForecasts) {
    const arr = byStore.get(f.storeId) ?? [];
    arr.push(f);
    byStore.set(f.storeId, arr);
  }

  let updated = 0;
  for (const [storeId, storeFcasts] of byStore) {
    // Get all dates we need actuals for
    const minDate = storeFcasts.reduce(
      (min, f) => (f.forecastDate < min ? f.forecastDate : min),
      storeFcasts[0]!.forecastDate
    );

    const dailyActuals = await prisma.$queryRaw<
      Array<{ date: string; revenue: number }>
    >`
      SELECT
        DATE_TRUNC('day', "createdAt")::date::text AS date,
        COALESCE(SUM("totalPrice"), 0)::float AS revenue
      FROM orders
      WHERE "storeId" = ${storeId}
        AND "createdAt" >= ${minDate}
        AND "createdAt" < ${new Date()}
      GROUP BY DATE_TRUNC('day', "createdAt")
    `;

    const actualMap = new Map(dailyActuals.map((d) => [d.date, d.revenue]));

    for (const f of storeFcasts) {
      const dateStr = f.forecastDate.toISOString().split("T")[0]!;
      const actual = actualMap.get(dateStr) ?? 0;
      const accuracy =
        f.predicted > 0
          ? round4(Math.abs(1 - actual / f.predicted))
          : actual === 0
            ? 0
            : 1;

      await prisma.revenueForecast.update({
        where: { id: f.id },
        data: { actual: round2(actual), accuracy },
      });
      updated++;
    }
  }

  console.log(`[RevenueForecast] Updated accuracy for ${updated} forecasts`);
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function linearTrend(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i]!;
    sumXY += i * values[i]!;
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  return denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
}

function standardDeviation(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

async function getExistingConfig(
  storeId: string
): Promise<Record<string, unknown>> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { messagingConfig: true },
  });
  return (store?.messagingConfig as Record<string, unknown>) ?? {};
}
