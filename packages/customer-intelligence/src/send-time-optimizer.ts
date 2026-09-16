/**
 * Send Time Optimization
 *
 * Determines the optimal hour and day-of-week to send communications
 * to a specific customer, falling back to store-level aggregates when
 * individual data is insufficient.
 */

import { prisma } from "@allohq/database";

export interface SendTimeResult {
  /** Optimal hour of day (0-23, in the store timezone) */
  bestHour: number;
  /** Optimal day of week (0 = Sunday, 6 = Saturday) */
  bestDayOfWeek: number;
  /** Confidence score 0-1 based on data volume */
  confidence: number;
  /** Where the recommendation came from */
  source: "customer" | "store" | "default";
  timezone: string;
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

export type DeliveryWindow = "morning" | "afternoon" | "evening";

export const DELIVERY_WINDOWS: Record<DeliveryWindow, { startHour: number; endHour: number }> = {
  morning: { startHour: 9, endHour: 11 },
  afternoon: { startHour: 13, endHour: 15 },
  evening: { startHour: 18, endHour: 20 },
};

export function deliveryWindowForHour(hour: number): DeliveryWindow {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

interface TimestampRow {
  openedAt: Date | null;
  clickedAt: Date | null;
}

export function resolveDeliveryTimezone(
  optimalSendWindow: unknown,
  storeTimezone?: string | null
): string {
  const window = optimalSendWindow as { timezone?: unknown } | null;
  return typeof window?.timezone === "string" && window.timezone.trim()
    ? window.timezone
    : storeTimezone || "UTC";
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
export function localHour(timestamp: Date, timezone: string): number {
  return localPart(timestamp, timezone, "hour");
}

function localPart(timestamp: Date, timezone: string, part: "hour" | "weekday"): number {
  try {
    if (part === "hour")
      return (
        Number(
          new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            hour: "numeric",
            hour12: false,
          }).format(timestamp)
        ) % 24
      );
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).format(timestamp);
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  } catch {
    return part === "hour" ? timestamp.getUTCHours() : timestamp.getUTCDay();
  }
}

function buildHourHistogram(timestamps: Date[], timezone: string): number[] {
  const histogram = new Array<number>(24).fill(0);
  for (const ts of timestamps) {
    const hour = localPart(ts, timezone, "hour");
    histogram[hour]!++;
  }
  return histogram;
}

/**
 * Build a day-of-week histogram from timestamps.
 */
function buildDayHistogram(timestamps: Date[], timezone: string): number[] {
  const histogram = new Array<number>(7).fill(0);
  for (const ts of timestamps) {
    const day = localPart(ts, timezone, "weekday");
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
  storeId: string
): Promise<SendTimeResult> {
  const [store, state] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { timezone: true } }),
    prisma.customerState.findUnique({ where: { customerId }, select: { optimalSendWindow: true } }),
  ]);
  const timezone = resolveDeliveryTimezone(state?.optimalSendWindow, store?.timezone);
  // 1. Try customer-level engagement events (opens + clicks from MessageLog)
  const customerLogs = await prisma.messageLog.findMany({
    where: {
      customerId,
      storeId,
      OR: [{ openedAt: { not: null } }, { clickedAt: { not: null } }],
    },
    select: { openedAt: true, clickedAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const customerTimestamps = extractTimestamps(customerLogs);
  if (customerTimestamps.length >= MIN_CUSTOMER_EVENTS) {
    return buildResult(customerTimestamps, "customer", timezone);
  }

  // 2. Fall back to store-level aggregates
  const storeLogs = await prisma.messageLog.findMany({
    where: {
      storeId,
      OR: [{ openedAt: { not: null } }, { clickedAt: { not: null } }],
    },
    select: { openedAt: true, clickedAt: true },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const storeTimestamps = extractTimestamps(storeLogs);
  if (storeTimestamps.length >= MIN_STORE_EVENTS) {
    return buildResult(storeTimestamps, "store", timezone);
  }

  // 3. Fall back to industry defaults
  return {
    bestHour: DEFAULT_HOURS[0]!,
    bestDayOfWeek: DEFAULT_DAY,
    confidence: 0.1,
    source: "default",
    timezone,
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
  timezone: string
): SendTimeResult {
  const hourHist = buildHourHistogram(timestamps, timezone);
  const dayHist = buildDayHistogram(timestamps, timezone);
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
    timezone,
    topHours: rankedHours.slice(0, 3),
    dayScores: rankedDays,
  };
}

export interface TimingProfileResult {
  customerId: string;
  timezone: string;
  window: DeliveryWindow;
  bestDayOfWeek: number | null;
  evidenceCount: number;
  confidence: number;
  source: "customer" | "store" | "default";
}

/** Precompute broad windows so campaign planning never queries history per recipient. */
export async function rebuildSendTimeProfiles(storeId: string): Promise<{
  customerProfiles: number;
  storeEvidence: number;
}> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { timezone: true },
  });
  if (!store) throw new Error(`Store ${storeId} not found`);
  const storeTimezone = store.timezone || "UTC";
  const since = new Date(Date.now() - 180 * 86_400_000);
  const storeRows: TimestampRow[] = [];
  const byCustomer = new Map<string, TimestampRow[]>();
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.messageLog.findMany({
      where: {
        storeId,
        createdAt: { gte: since },
        OR: [{ openedAt: { not: null } }, { clickedAt: { not: null } }],
      },
      select: { id: true, customerId: true, openedAt: true, clickedAt: true },
      orderBy: { id: "asc" },
      take: 10_000,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const evidence = { openedAt: row.openedAt, clickedAt: row.clickedAt };
      storeRows.push(evidence);
      if (row.customerId) {
        const current = byCustomer.get(row.customerId) ?? [];
        if (current.length < 200) current.push(evidence);
        byCustomer.set(row.customerId, current);
      }
    }
    cursor = rows.at(-1)!.id;
    if (rows.length < 10_000) break;
  }

  const storeTimestamps = extractTimestamps(storeRows);
  const storeResult =
    storeTimestamps.length >= MIN_STORE_EVENTS
      ? buildResult(storeTimestamps, "store", storeTimezone)
      : null;
  const qualifyingIds = [...byCustomer.entries()]
    .filter(([, rows]) => extractTimestamps(rows).length >= MIN_CUSTOMER_EVENTS)
    .map(([customerId]) => customerId);
  const timezoneByCustomer = new Map<string, string>();
  for (let index = 0; index < qualifyingIds.length; index += 5_000) {
    const states = await prisma.customerState.findMany({
      where: { customerId: { in: qualifyingIds.slice(index, index + 5_000) } },
      select: { customerId: true, optimalSendWindow: true },
    });
    for (const state of states) {
      timezoneByCustomer.set(
        state.customerId,
        resolveDeliveryTimezone(state.optimalSendWindow, storeTimezone)
      );
    }
  }

  const computedAt = new Date();
  const profiles = qualifyingIds.map((customerId) => {
    const timezone = timezoneByCustomer.get(customerId) ?? storeTimezone;
    const timestamps = extractTimestamps(byCustomer.get(customerId) ?? []);
    const result = buildResult(timestamps, "customer", timezone);
    return {
      storeId,
      customerId,
      timezone,
      window: deliveryWindowForHour(result.bestHour),
      bestDayOfWeek: result.bestDayOfWeek,
      evidenceCount: timestamps.length,
      confidence: result.confidence,
      hourlyEvidence: result.topHours,
      dayEvidence: result.dayScores,
      computedAt,
    };
  });

  await prisma.$transaction(async (tx) => {
    await tx.customerTimingProfile.deleteMany({ where: { storeId } });
    for (let index = 0; index < profiles.length; index += 5_000) {
      await tx.customerTimingProfile.createMany({ data: profiles.slice(index, index + 5_000) });
    }
    if (storeResult) {
      await tx.storeTimingProfile.upsert({
        where: { storeId },
        create: {
          storeId,
          timezone: storeTimezone,
          window: deliveryWindowForHour(storeResult.bestHour),
          bestDayOfWeek: storeResult.bestDayOfWeek,
          evidenceCount: storeTimestamps.length,
          confidence: storeResult.confidence,
          hourlyEvidence: storeResult.topHours,
          dayEvidence: storeResult.dayScores,
          computedAt,
        },
        update: {
          timezone: storeTimezone,
          window: deliveryWindowForHour(storeResult.bestHour),
          bestDayOfWeek: storeResult.bestDayOfWeek,
          evidenceCount: storeTimestamps.length,
          confidence: storeResult.confidence,
          hourlyEvidence: storeResult.topHours,
          dayEvidence: storeResult.dayScores,
          computedAt,
        },
      });
    } else {
      await tx.storeTimingProfile.deleteMany({ where: { storeId } });
    }
  });
  return { customerProfiles: profiles.length, storeEvidence: storeTimestamps.length };
}

export async function getTimingProfiles(
  storeId: string,
  customerIds: string[]
): Promise<Map<string, TimingProfileResult>> {
  const [store, storeProfile] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { timezone: true } }),
    prisma.storeTimingProfile.findUnique({ where: { storeId } }),
  ]);
  // Keep database parameter counts bounded for six-figure audiences.
  const customerProfiles: Awaited<ReturnType<typeof prisma.customerTimingProfile.findMany>> = [];
  for (let index = 0; index < customerIds.length; index += 5_000) {
    customerProfiles.push(
      ...(await prisma.customerTimingProfile.findMany({
        where: { storeId, customerId: { in: customerIds.slice(index, index + 5_000) } },
      }))
    );
  }
  const storeTimezone = store?.timezone || "UTC";
  const byCustomer = new Map(customerProfiles.map((profile) => [profile.customerId, profile]));
  const result = new Map<string, TimingProfileResult>();
  for (const customerId of customerIds) {
    const customer = byCustomer.get(customerId);
    if (customer) {
      result.set(customerId, {
        customerId,
        timezone: customer.timezone,
        window: customer.window as DeliveryWindow,
        bestDayOfWeek: customer.bestDayOfWeek,
        evidenceCount: customer.evidenceCount,
        confidence: customer.confidence,
        source: "customer",
      });
    } else if (storeProfile) {
      result.set(customerId, {
        customerId,
        timezone: storeProfile.timezone,
        window: storeProfile.window as DeliveryWindow,
        bestDayOfWeek: storeProfile.bestDayOfWeek,
        evidenceCount: storeProfile.evidenceCount,
        confidence: storeProfile.confidence,
        source: "store",
      });
    } else {
      result.set(customerId, {
        customerId,
        timezone: storeTimezone,
        window: "morning",
        bestDayOfWeek: null,
        evidenceCount: 0,
        confidence: 0.1,
        source: "default",
      });
    }
  }
  return result;
}
