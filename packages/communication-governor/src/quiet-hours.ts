import type { GovernorDecision, QuietHoursConfig } from "./types";
import { DEFAULT_QUIET_HOURS } from "./types";

/**
 * Check if the current time falls within quiet hours for the customer's timezone.
 * Default quiet hours: 10pm - 7am.
 */
export function checkQuietHours(
  timezone?: string,
  config?: Partial<QuietHoursConfig>,
): GovernorDecision {
  const tz = timezone ?? config?.timezone ?? DEFAULT_QUIET_HOURS.timezone;
  const startHour = config?.startHour ?? DEFAULT_QUIET_HOURS.startHour;
  const endHour = config?.endHour ?? DEFAULT_QUIET_HOURS.endHour;

  // Get current hour in the customer's timezone
  let currentHour: number;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: tz,
    });
    currentHour = parseInt(formatter.format(new Date()), 10);
  } catch {
    // Invalid timezone — fall back to UTC
    currentHour = new Date().getUTCHours();
  }

  // Check if current hour is in quiet range
  let inQuietHours: boolean;
  if (startHour > endHour) {
    // Wraps midnight: e.g., 22:00 - 07:00
    inQuietHours = currentHour >= startHour || currentHour < endHour;
  } else {
    // Same day: e.g., 01:00 - 06:00
    inQuietHours = currentHour >= startHour && currentHour < endHour;
  }

  if (inQuietHours) {
    // Calculate when quiet hours end
    const now = new Date();
    const delayUntil = new Date(now);
    if (startHour > endHour) {
      // If we're past midnight, end is today at endHour
      // If we're before midnight, end is tomorrow at endHour
      if (currentHour >= startHour) {
        delayUntil.setDate(delayUntil.getDate() + 1);
      }
    }
    delayUntil.setHours(endHour, 0, 0, 0);

    return {
      allowed: false,
      reason: `Quiet hours (${startHour}:00 - ${endHour}:00 ${tz}). Will send after ${endHour}:00.`,
      rule: "quiet_hours",
      delayUntil,
    };
  }

  return { allowed: true };
}
