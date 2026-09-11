export const CAMPAIGN_ORIGINS = ["merchant", "joon"] as const;
export type CampaignOriginValue = (typeof CAMPAIGN_ORIGINS)[number];

/** Validate untrusted campaign-origin input at API/agent creation boundaries. */
export function parseCampaignOrigin(value: unknown): CampaignOriginValue {
  if (value === "merchant" || value === "joon") return value;
  throw new TypeError("campaign origin must be merchant or joon");
}

