/**
 * Send Time Optimization
 *
 * Determines the optimal hour and day-of-week to send communications
 * to a specific customer, falling back to store-level aggregates when
 * individual data is insufficient.
 */

import { prisma } from "@allohq/database";

export interface SendTimeResult {
  /** Optimal hour of day (0-23, in UTC) */
  bestHour: number;
  /** Optimal day of week (0 = Sunday, 6 = Saturday) */
  bestDayOfWeek: number;
  /** Confidence score 0-1 based on data volume */
  confidence: number;
  /** Where the recommendation came from */
  source: "customer" | "store" | "default";
  /** Top 3 hours ranked by engagement, with scores */
  topHours: { hour: number; score: number }[];
  /** Day-of-week scores (0-6) */
  dayScores: { day: number; score: number }[];
}

/** Minimum number of engagement events to trust customer-level data */
const MIN_CUSTOMER_EVENTS = 10;
/** Minimum number of engagement events to trust store-level data */
const MIN_STORE_EVENTS = 30;

/**
 * Default send times when no data is available.
 * Based on e-commerce industry benchmarks.
 */
const DEFAULT_HOURS = [10, 14, 19]; // 10am, 2pm, 7pm
const DEFAULT_DAY = 2; // Tuesday

interface TimestampRow {
  openedAt: Date | null;
  clickedAt: Date | null;
}

/**
 * Extract engagement timestamps from MessageLog rows.
 * Prefers clickedAt, falls back to openedAt.
 */
function extractTimestamps(rows: TimestampRow[]): Date[] {
  const timestamps: Date[] = [];
  for (const row of rows) {
    const ts = row.clickedAt ?? row.openedAt;
    if (ts) timestamps.push(ts);
  }
  return timestamps;
}

/**
 * Build an hour-of-day histogram from timestamps.
 */
function buildHourHistogram(timestamps: Date[]): number[] {
  const histogram = new Array<number>(24).fill(0);
  for (const ts of timestamps) {
    const hour = ts.getUTCHours();
    histogram[hour]!++;
  }
  return histogram;
}

/**
 * Build a day-of-week histogram from timestamps.
 */
function buildDayHistogram(timestamps: Date[]): number[] {
  const histogram = new Array<number>(7).fill(0);
  for (const ts of timestamps) {
    const day = ts.getUTCDay();
    histogram[day]!++;
  }
  return histogram;
}

/**
 * Convert a count histogram to normalized scores (0-1).
 */
function normalizeHistogram(histogram: number[]): number[] {
  const max = Math.max(...histogram);
  if (max === 0) return histogram.map(() => 0);
  return histogram.map((v) => Math.round((v / max) * 1000) / 1000);
}

/**
 * Determine the optimal send time for a customer.
 */
export async function getOptimalSendTime(
  customerId: string,
  storeId: string,
): Promise<SendTimeResult> {
  // 1. Try customer-level engagement events (opens + clicks from MessageLog)
  const customerLogs = await prisma.messageLog.findMany({
    where: {
      customerId,
      OR: [
        { openedAt: { not: null } },
        { clickedAt: { not: null } },
      ],
    },
    select: { openedAt: true, clickedAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const customerTimestamps = extractTimestamps(customerLogs);
  if (customerTimestamps.length >= MIN_CUSTOMER_EVENTS) {
    return buildResult(customerTimestamps, "customer");
  }

  // 2. Fall back to store-level aggregates
  const storeLogs = await prisma.messageLog.findMany({
    where: {
      storeId,
      OR: [
        { openedAt: { not: null } },
        { clickedAt: { not: null } },
      ],
    },
    select: { openedAt: true, clickedAt: true },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const storeTimestamps = extractTimestamps(storeLogs);
  if (storeTimestamps.length >= MIN_STORE_EVENTS) {
    return buildResult(storeTimestamps, "store");
  }

  // 3. Fall back to industry defaults
  return {
    bestHour: DEFAULT_HOURS[0]!,
    bestDayOfWeek: DEFAULT_DAY,
    confidence: 0.1,
    source: "default",
    topHours: DEFAULT_HOURS.map((h, i) => ({ hour: h, score: 1 - i * 0.15 })),
    dayScores: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day: d,
      score: d === DEFAULT_DAY ? 1 : d >= 1 && d <= 4 ? 0.7 : 0.3,
    })),
  };
}

function buildResult(
  timestamps: Date[],
  source: "customer" | "store",
): SendTimeResult {
  const hourHist = buildHourHistogram(timestamps);
  const dayHist = buildDayHistogram(timestamps);
  const hourScores = normalizeHistogram(hourHist);
  const dayScores = normalizeHistogram(dayHist);

  // Find best hour
  const rankedHours = hourScores
    .map((score, hour) => ({ hour, score }))
    .sort((a, b) => b.score - a.score);

  // Find best day
  const rankedDays = dayScores
    .map((score, day) => ({ day, score }))
    .sort((a, b) => b.score - a.score);

  // Confidence based on volume
  const maxExpected = source === "customer" ? 100 : 500;
  const confidence = Math.min(0.95, Math.round((timestamps.length / maxExpected) * 100) / 100);

  return {
    bestHour: rankedHours[0]!.hour,
    bestDayOfWeek: rankedDays[0]!.day,
    confidence,
    source,
    topHours: rankedHours.slice(0, 3),
    dayScores: rankedDays,
  };
}
