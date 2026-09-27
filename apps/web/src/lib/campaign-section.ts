export const CAMPAIGN_SECTIONS = ["overview", "message", "audience", "delivery", "results", "receipt"] as const;
export type CampaignSection = (typeof CAMPAIGN_SECTIONS)[number];

export function campaignSectionFromParam(value: string | null, fallback: CampaignSection = "overview"): CampaignSection {
  return CAMPAIGN_SECTIONS.find((section) => section === value) ?? fallback;
}

export function campaignSectionHref(campaignId: string, section: CampaignSection): string {
  return `/campaigns/${encodeURIComponent(campaignId)}?tab=${section}`;
}
