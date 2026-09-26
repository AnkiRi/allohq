const DECISION_TIME_ZONE = "Asia/Kolkata";

/** Match Activity times so a merchant can compare the same decision across pages. */
export function formatDecisionTime(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: DECISION_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date) + " IST";
}
