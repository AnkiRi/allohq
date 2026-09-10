import type { GovernorDecision, QuietHoursConfig } from "./types";
import { DEFAULT_QUIET_HOURS } from "./types";

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number };

function validTimezone(timezone: string): string {
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(0); return timezone; }
  catch { return "UTC"; }
}

function partsAt(date: Date, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
}

function localToInstant(local: ZonedParts, timezone: string): Date {
  const wallAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0, 0);
  let candidate = wallAsUtc;
  for (let i = 0; i < 4; i++) {
    const actual = partsAt(new Date(candidate), timezone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0, 0);
    const corrected = candidate + wallAsUtc - actualAsUtc;
    if (corrected === candidate) break;
    candidate = corrected;
  }
  return new Date(candidate);
}

function plusLocalDays(local: ZonedParts, days: number): ZonedParts {
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: local.hour, minute: local.minute };
}

/** Next occurrence of a local hour, converted using that date's IANA-zone offset. */
export function nextLocalHour(now: Date, hour: number, timezone?: string): Date {
  const tz = validTimezone(timezone ?? "UTC");
  const local = partsAt(now, tz);
  const tomorrow = local.hour > hour || (local.hour === hour && local.minute > 0);
  return localToInstant(plusLocalDays({ ...local, hour, minute: 0 }, tomorrow ? 1 : 0), tz);
}

/**
 * Check if the current time falls within quiet hours for the customer's timezone.
 * Default quiet hours: 10pm - 7am.
 */
export function checkQuietHours(
  timezone?: string,
  config?: Partial<QuietHoursConfig>,
  now = new Date(),
): GovernorDecision {
  const tz = validTimezone(timezone ?? config?.timezone ?? DEFAULT_QUIET_HOURS.timezone);
  const startHour = config?.startHour ?? DEFAULT_QUIET_HOURS.startHour;
  const endHour = config?.endHour ?? DEFAULT_QUIET_HOURS.endHour;

  const currentHour = partsAt(now, tz).hour;

  // Check if current hour is in quiet range
  let inQuietHours = false;
  if (startHour > endHour) {
    // Wraps midnight: e.g., 22:00 - 07:00
    inQuietHours = currentHour >= startHour || currentHour < endHour;
  } else if (startHour < endHour) {
    // Same day: e.g., 01:00 - 06:00
    inQuietHours = currentHour >= startHour && currentHour < endHour;
  }

  if (inQuietHours) {
    return {
      allowed: false,
      reason: `Quiet hours (${startHour}:00 - ${endHour}:00 ${tz}). Will send after ${endHour}:00.`,
      rule: "quiet_hours",
      delayUntil: nextLocalHour(now, endHour, tz),
    };
  }

  return { allowed: true };
}
