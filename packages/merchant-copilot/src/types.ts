/** Briefing types */
export type BriefingType = "daily" | "weekly" | "alert";

/** Structured briefing content */
export interface BriefingContent {
  title: string;
  summary: string;
  sections: BriefingSection[];
  generatedAt: string;
}

export interface BriefingSection {
  heading: string;
  items: BriefingItem[];
}

export interface BriefingItem {
  text: string;
  metric?: { value: string; change?: string; trend?: "up" | "down" | "flat" };
  actionUrl?: string;
  priority?: "high" | "medium" | "low";
}

/** Baseline metrics snapshot */
export interface BaselineMetrics {
  capturedAt: string;
  customerCount: number;
  activeCustomerCount: number;
  totalRevenue: number;
  avgOrderValue: number;
  orderCount: number;
  segmentDistribution: Record<string, number>;
  emailSubscribers: number;
  churnRate: number;
  repeatPurchaseRate: number;
}

/** Mission Control data structure */
export interface MissionControlData {
  sinceLastVisit: {
    revenue: number;
    orders: number;
    newCustomers: number;
    lastVisitAt?: string;
  };
  needsAttention: {
    pendingActions: number;
    urgentActions: number;
    inventoryAlerts: number;
  };
  alloActivity: {
    campaignsSent: number;
    emailsSent: number;
    suppressedCount: number;
    revenue: number;
  };
  opportunities: {
    type: string;
    description: string;
    estimatedRevenue: number;
    customerCount: number;
  }[];
}

/** Store intelligence report */
export interface StoreIntelligenceReport {
  storeId: string;
  generatedAt: string;
  customerInsights: {
    totalCustomers: number;
    segmentBreakdown: Record<string, number>;
    topSegment: string;
    churnRiskCount: number;
    vipCount: number;
  };
  revenueInsights: {
    totalRevenue: number;
    avgOrderValue: number;
    repeatPurchaseRate: number;
    topProducts: { title: string; revenue: number }[];
  };
  recommendations: string[];
}
