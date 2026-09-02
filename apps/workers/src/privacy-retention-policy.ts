const DAY_MS = 24 * 60 * 60 * 1_000;

export const PRIVACY_PAYLOAD_RETENTION_DAYS = 30;
export const PRIVACY_AUDIT_RETENTION_DAYS = 365;
export const PROVIDER_EVENT_RETENTION_DAYS = 90;

export function privacyRetentionCutoffs(now = new Date()) {
  const at = now.getTime();
  return {
    scrubBefore: new Date(at - PRIVACY_PAYLOAD_RETENTION_DAYS * DAY_MS),
    deleteBefore: new Date(at - PRIVACY_AUDIT_RETENTION_DAYS * DAY_MS),
    providerEventDeleteBefore: new Date(
      at - PROVIDER_EVENT_RETENTION_DAYS * DAY_MS,
    ),
  };
}
