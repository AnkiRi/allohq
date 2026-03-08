import { prisma } from "@allohq/database";
import type { SendWindow } from "@allohq/customer-state";

/**
 * Get the optimal send time for a customer.
 * Uses CustomerState.optimalSendWindow if available,
 * otherwise falls back to store timezone defaults.
 */
export async function getOptimalSendTime(
  customerId: string,
  storeId: string,
): Promise<Date> {
  const [state, store] = await Promise.all([
    prisma.customerState.findUnique({
      where: { customerId },
      select: { optimalSendWindow: true },
    }),
    prisma.store.findUnique({
      where: { id: storeId },
      select: { timezone: true },
    }),
  ]);

  const sendWindow = state?.optimalSendWindow as SendWindow | null;
  const timezone = sendWindow?.timezone ?? store?.timezone ?? "UTC";
  const bestHours = sendWindow?.bestHours ?? [10, 14, 19]; // default optimal hours

  const now = new Date();
  const currentHour = getHourInTimezone(now, timezone);

  // Find the next best hour
  const nextHour = bestHours.find((h) => h > currentHour);

  if (nextHour !== undefined) {
    // Send later today at the next best hour
    return setHourInTimezone(now, nextHour, timezone);
  }

  // All best hours have passed today, use the first best hour tomorrow
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return setHourInTimezone(tomorrow, bestHours[0] ?? 10, timezone);
}

/**
 * Recalculate optimal send times for all customers in a store
 * based on engagement data (opens, clicks).
 */
export async function recalculateSendTimes(storeId: string): Promise<number> {
  // Get all customers with engagement data
  const customers = await prisma.customer.findMany({
    where: { storeId },
    select: { id: true },
  });

  let updated = 0;

  for (const customer of customers) {
    // Query message logs for opens/clicks with timestamps
    const engagements = await prisma.messageLog.findMany({
      where: {
        customerId: customer.id,
        status: { in: ["opened", "clicked"] },
      },
      select: { sentAt: true, openedAt: true, clickedAt: true },
      orderBy: { sentAt: "desc" },
      take: 50, // last 50 engagements
    });

    if (engagements.length < 5) continue; // not enough data

    // Extract hours from engagement timestamps
    const hours: number[] = [];
    for (const e of engagements) {
      const ts = e.clickedAt ?? e.openedAt ?? e.sentAt;
      if (ts) {
        hours.push(ts.getUTCHours());
      }
    }

    if (hours.length < 5) continue;

    // Find top 3 most frequent hours
    const hourCounts: Record<number, number> = {};
    for (const h of hours) {
      hourCounts[h] = (hourCounts[h] ?? 0) + 1;
    }
    const bestHours = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([h]) => Number(h))
      .sort((a, b) => a - b);

    // Get existing state timezone
    const state = await prisma.customerState.findUnique({
      where: { customerId: customer.id },
      select: { optimalSendWindow: true },
    });
    const existing = state?.optimalSendWindow as SendWindow | null;

    await prisma.customerState.upsert({
      where: { customerId: customer.id },
      update: {
        optimalSendWindow: {
          timezone: existing?.timezone ?? "UTC",
          bestHours,
        },
      },
      create: {
        customerId: customer.id,
        storeId,
        lifecycleStage: "subscriber",
        optimalSendWindow: {
          timezone: "UTC",
          bestHours,
        },
      },
    });
    updated++;
  }

  return updated;
}

function getHourInTimezone(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    return Number(formatter.format(date));
  } catch {
    return date.getUTCHours();
  }
}

function setHourInTimezone(date: Date, targetHour: number, timezone: string): Date {
  const currentHour = getHourInTimezone(date, timezone);
  const diff = targetHour - currentHour;
  const result = new Date(date.getTime() + diff * 60 * 60 * 1000);
  // Zero out minutes/seconds for a clean send time
  result.setMinutes(0, 0, 0);
  return result;
}
