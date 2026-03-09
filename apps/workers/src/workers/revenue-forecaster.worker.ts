import { Worker } from "bullmq";
import type { Job } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";

interface ForecastJobData {
  storeId: string;
}

/**
 * Revenue Forecaster Worker
 * Daily job: generates 7/30/90-day revenue projections
 * based on historical order trends + campaign pipeline.
 */
export const revenueForecastWorker = new Worker<ForecastJobData>(
  QUEUE_NAMES.REVENUE_FORECAST,
  async (job: Job<ForecastJobData>) => {
    const { storeId } = job.data;
    console.log(`[RevenueForecast] Generating forecast for store ${storeId}`);

    // Get daily revenue for last 90 days
    const since = new Date(Date.now() - 90 * 86400000);
    const dailyRevenue = await prisma.$queryRaw<Array<{
      date: string;
      revenue: number;
      orders: number;
    }>>`
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
      console.log(`[RevenueForecast] Insufficient data (${dailyRevenue.length} days)`);
      return;
    }

    // Calculate moving averages for different windows
    const revenueValues = dailyRevenue.map((d) => d.revenue);
    const avg7 = movingAverage(revenueValues, 7);
    const avg30 = movingAverage(revenueValues, 30);
    const avg90 = movingAverage(revenueValues, Math.min(90, revenueValues.length));

    // Calculate trend (linear regression slope on last 30 days)
    const recent = revenueValues.slice(-30);
    const trend = linearTrend(recent);

    // Calculate volatility (standard deviation / mean)
    const stdDev = standardDeviation(recent);
    const mean = recent.reduce((s, v) => s + v, 0) / recent.length;
    const volatility = mean > 0 ? stdDev / mean : 0.3;

    // Generate forecasts
    const now = new Date();
    const forecasts = {
      forecast7d: generateForecast(now, 7, avg7, trend, volatility),
      forecast30d: generateForecast(now, 30, avg30, trend, volatility),
      forecast90d: generateForecast(now, 90, avg90, trend, volatility),
    };

    // Store forecast in store metadata
    await prisma.store.update({
      where: { id: storeId },
      data: {
        messagingConfig: {
          ...(await getExistingConfig(storeId)),
          revenueForecast: JSON.parse(JSON.stringify({
            ...forecasts,
            generatedAt: now.toISOString(),
            metrics: {
              avg7d: Math.round(avg7 * 100) / 100,
              avg30d: Math.round(avg30 * 100) / 100,
              avg90d: Math.round(avg90 * 100) / 100,
              trend: Math.round(trend * 100) / 100,
              volatility: Math.round(volatility * 1000) / 1000,
            },
          })),
        },
      },
    });

    console.log(
      `[RevenueForecast] Complete: 7d avg=$${avg7.toFixed(0)}, 30d avg=$${avg30.toFixed(0)}, trend=${trend > 0 ? "+" : ""}${trend.toFixed(2)}/day`
    );
  },
  { connection: redisConnection }
);

function generateForecast(
  startDate: Date,
  days: number,
  baseAvg: number,
  dailyTrend: number,
  volatility: number
): Array<{ date: string; projected: number; lower: number; upper: number }> {
  const points: Array<{ date: string; projected: number; lower: number; upper: number }> = [];

  for (let i = 1; i <= days; i++) {
    const date = new Date(startDate.getTime() + i * 86400000);
    const projected = Math.max(0, baseAvg + dailyTrend * i);
    const uncertainty = volatility * baseAvg * Math.sqrt(i / 7); // grows with sqrt of time
    points.push({
      date: date.toISOString().split("T")[0]!,
      projected: Math.round(projected * 100) / 100,
      lower: Math.round(Math.max(0, projected - uncertainty) * 100) / 100,
      upper: Math.round((projected + uncertainty) * 100) / 100,
    });
  }

  return points;
}

function movingAverage(values: number[], window: number): number {
  const slice = values.slice(-window);
  return slice.length > 0 ? slice.reduce((s, v) => s + v, 0) / slice.length : 0;
}

function linearTrend(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
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

async function getExistingConfig(storeId: string): Promise<Record<string, unknown>> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { messagingConfig: true },
  });
  return (store?.messagingConfig as Record<string, unknown>) ?? {};
}
