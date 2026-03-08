import type { CalendarEvent } from "./types";

/** Major holidays and shopping events */
const GLOBAL_EVENTS: CalendarEvent[] = [
  { name: "New Year's Day", date: new Date(2026, 0, 1), type: "holiday" },
  { name: "Valentine's Day", date: new Date(2026, 1, 14), type: "holiday" },
  { name: "International Women's Day", date: new Date(2026, 2, 8), type: "holiday" },
  { name: "Mother's Day", date: new Date(2026, 4, 10), type: "holiday", region: "US" },
  { name: "Father's Day", date: new Date(2026, 5, 21), type: "holiday", region: "US" },
  { name: "Independence Day", date: new Date(2026, 6, 4), type: "holiday", region: "US" },
  { name: "Back to School", date: new Date(2026, 7, 15), type: "season" },
  { name: "Labor Day", date: new Date(2026, 8, 7), type: "holiday", region: "US" },
  { name: "Halloween", date: new Date(2026, 9, 31), type: "holiday" },
  { name: "Diwali", date: new Date(2026, 9, 20), type: "holiday", region: "IN" },
  { name: "Singles' Day (11.11)", date: new Date(2026, 10, 11), type: "holiday" },
  { name: "Black Friday", date: new Date(2026, 10, 27), type: "holiday" },
  { name: "Cyber Monday", date: new Date(2026, 10, 30), type: "holiday" },
  { name: "Christmas", date: new Date(2026, 11, 25), type: "holiday" },
  { name: "Boxing Day", date: new Date(2026, 11, 26), type: "holiday" },
  { name: "New Year's Eve", date: new Date(2026, 11, 31), type: "holiday" },

  // Seasonal
  { name: "Spring Collection", date: new Date(2026, 2, 1), type: "season" },
  { name: "Summer Collection", date: new Date(2026, 5, 1), type: "season" },
  { name: "Fall Collection", date: new Date(2026, 8, 1), type: "season" },
  { name: "Winter Collection", date: new Date(2026, 11, 1), type: "season" },
];

/**
 * Get upcoming calendar events within a given window.
 */
export function getUpcomingEvents(daysAhead: number = 14, region?: string): CalendarEvent[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 86400000);

  return GLOBAL_EVENTS.filter((event) => {
    if (event.date < now || event.date > cutoff) return false;
    if (event.region && region && event.region !== region) return false;
    return true;
  }).sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Get the current season name.
 */
export function getCurrentSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "fall";
  return "winter";
}

/**
 * Check if we're in a major shopping season.
 */
export function isShoppingSeason(): boolean {
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();

  // Black Friday / Cyber Monday / Holiday season (Nov 15 - Dec 31)
  if (month === 10 && day >= 15) return true;
  if (month === 11) return true;

  return false;
}
