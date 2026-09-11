export type StoredSenderDomain = {
  domain: string;
  externalId: string | null;
  provider: string;
};

export function canReuseSenderDomain(
  existing: StoredSenderDomain | null,
  domain: string,
  provider: string,
): boolean {
  return existing?.domain === domain && Boolean(existing.externalId) && existing.provider === provider;
}

export function conflictsWithConfiguredDomain(
  existing: StoredSenderDomain | null,
  domain: string,
): boolean {
  return Boolean(existing?.externalId && existing.domain !== domain);
}
