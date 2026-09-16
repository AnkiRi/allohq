export const PROVIDER_ACCEPTED_STATUSES = [
  "sent",
  "delivered",
  "delivery_delayed",
  "opened",
  "clicked",
  "bounced",
  "complained",
] as const;

export function campaignDeliveryCompletion(
  planned: number,
  counts: Record<string, number>,
) {
  const accepted = PROVIDER_ACCEPTED_STATUSES.reduce(
    (sum, status) => sum + (counts[status] ?? 0),
    0,
  );
  const failed = counts["failed"] ?? 0;
  const suppressed = counts["suppressed"] ?? 0;
  const completed = accepted + failed + suppressed;
  const status = completed < planned
    ? null
    : accepted === planned
      ? "sent" as const
      : accepted > 0
        ? "partially_sent" as const
        : "failed" as const;
  return { accepted, failed, suppressed, completed, status };
}
