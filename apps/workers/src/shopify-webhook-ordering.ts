export function isWebhookOlderThanInstall(
  triggeredAt: string | null | undefined,
  installedAt: Date,
) {
  if (!triggeredAt) return false;
  const triggeredAtMs = Date.parse(triggeredAt);
  return Number.isFinite(triggeredAtMs) && triggeredAtMs <= installedAt.getTime();
}
