/** Opportunity types that the scanner can detect */
export type OpportunityType =
  | "at_risk_winback"
  | "repurchase_window"
  | "new_arrival"
  | "low_stock"
  | "seasonal"
  | "vip_milestone"
  | "cross_sell"
  | "re_engagement";

/** A detected campaign opportunity */
export interface CampaignOpportunity {
  type: OpportunityType;
  storeId: string;
  segmentName?: string;
  /**
   * Present only for opportunities small enough to enumerate. Large audiences
   * carry `audienceFingerprint` instead, so a scan never holds the list.
   */
  customerIds?: string[];
  /** Streamed digest of the audience, byte-identical to hashing the array. */
  audienceFingerprint?: string;
  customerCount: number;
  productIds?: string[];
  reasoning: string;
  urgency: number; // 0-100
  estimatedRevenue?: RevenueEstimate;
  metadata?: Record<string, unknown>;
}

/** Revenue estimate range */
export interface RevenueEstimate {
  low: number;
  mid: number;
  high: number;
  conversionRate: number;
  avgOrderValue: number;
}

/** Draft campaign ready for review/approval */
export interface CampaignDraft {
  storeId: string;
  opportunity: CampaignOpportunity;
  name: string;
  subject: string;
  archetypeId: string;
  html?: string;
  previewText?: string;
  blocks?: unknown[];
  contentSlots?: unknown;
  productIds?: string[];
  targetSegment: string;
  targetCount: number;
  estimatedRevenue: RevenueEstimate;
  confidenceScore: number;
  reasoning: string;
}

/** Calendar event (holiday, season, brand date) */
export interface CalendarEvent {
  name: string;
  date: Date;
  type: "holiday" | "season" | "brand";
  region?: string;
}

/** Performance data for learning loop */
export interface CampaignPerformance {
  campaignId: string;
  archetypeId?: string;
  segmentName?: string;
  openRate: number;
  clickRate: number;
  conversionRate: number;
  revenue: number;
  unsubscribeRate: number;
}
