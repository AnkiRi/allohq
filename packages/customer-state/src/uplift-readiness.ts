export interface UpliftTrainingExample {
  exampleId: string;
  storePseudonym: string;
  category: string;
  decisionAt: string;
  campaignId: string;
  customerPseudonym: string;
  eligibilityPolicyVersion: string;
  featureVersion: string;
  features: {
    rfm: number[]; lifecycle: string; cadenceDays: number | null;
    daysSinceOrder: number | null; historicalLtv: number; recentBrowse: number;
    recentMessages: number; discountSensitivity: number; localHour: number;
  };
  randomizedArm: "CONTROL" | "TREATMENT";
  treatment: { channel: "email"; offerPercent: number | null; creativeVariant: string } | null;
  outcome: { windowDays: number; purchased: boolean; revenue: number; margin: number | null };
  propensity: number;
  experimentId: string;
}

export type UpliftReadinessTier = "ledger_only" | "store_shadow" | "prospective_candidate";
export function upliftReadiness(input: { examples: number; controls: number; campaigns: number; lifecycleCoverage: number }): UpliftReadinessTier {
  if (input.examples >= 10_000 && input.controls >= 1_500 && input.campaigns >= 20 && input.lifecycleCoverage >= .8) return "prospective_candidate";
  if (input.examples >= 2_000 && input.controls >= 300 && input.campaigns >= 10) return "store_shadow";
  return "ledger_only";
}
