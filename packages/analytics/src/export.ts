import type { ChannelRevenue, CampaignComparison, CohortData, AttributionResult, RoiMetrics } from "./types";

/**
 * Export analytics data as CSV string.
 */
export function exportToCsv(
  type: "channel" | "attribution" | "cohort" | "comparison" | "roi",
  data: unknown
): string {
  switch (type) {
    case "channel":
      return channelToCsv(data as ChannelRevenue[]);
    case "attribution":
      return attributionToCsv(data as AttributionResult[]);
    case "cohort":
      return cohortToCsv(data as CohortData[]);
    case "comparison":
      return comparisonToCsv(data as { ai: CampaignComparison; manual: CampaignComparison });
    case "roi":
      return roiToCsv(data as RoiMetrics);
    default:
      return "";
  }
}

function channelToCsv(data: ChannelRevenue[]): string {
  const header = "Channel,Revenue,Orders,Messages,Open Rate %,Click Rate %,Conversion Rate %";
  const rows = data.map((d) =>
    `${d.channel},${d.revenue},${d.orderCount},${d.messageCount},${d.openRate},${d.clickRate},${d.conversionRate}`
  );
  return [header, ...rows].join("\n");
}

function attributionToCsv(data: AttributionResult[]): string {
  const header = "Source Type,Source Name,Channel,Revenue,Orders,Attribution Model";
  const rows = data.map((d) =>
    `${d.sourceType},"${d.sourceName}",${d.channel},${d.revenue},${d.orderCount},${d.attributionModel}`
  );
  return [header, ...rows].join("\n");
}

function cohortToCsv(data: CohortData[]): string {
  // Find max periods across all cohorts
  const maxPeriods = Math.max(...data.map((c) => c.periods.length), 0);
  const periodHeaders = Array.from({ length: maxPeriods }, (_, i) => `Month ${i} Retention %`);
  const header = ["Cohort", "Customers", ...periodHeaders].join(",");

  const rows = data.map((cohort) => {
    const retentions = Array.from({ length: maxPeriods }, (_, i) => {
      const period = cohort.periods.find((p) => p.periodIndex === i);
      return period ? String(period.retentionRate) : "";
    });
    return [cohort.cohortMonth, String(cohort.customerCount), ...retentions].join(",");
  });

  return [header, ...rows].join("\n");
}

function comparisonToCsv(data: { ai: CampaignComparison; manual: CampaignComparison }): string {
  const header = "Category,Campaigns,Recipients,Open Rate %,Click Rate %,Revenue,Avg Revenue/Campaign";
  const row = (d: CampaignComparison) =>
    `${d.category},${d.campaignCount},${d.totalRecipients},${d.avgOpenRate},${d.avgClickRate},${d.totalRevenue},${d.avgRevenuePerCampaign}`;
  return [header, row(data.ai), row(data.manual)].join("\n");
}

function roiToCsv(data: RoiMetrics): string {
  const header = "Metric,Value";
  const rows = [
    `AI Token Cost,$${data.aiTokenCost}`,
    `AI Attributed Revenue,$${data.aiAttributedRevenue}`,
    `ROI,${data.roi}x`,
    `Campaigns Sent,${data.campaignsSent}`,
    `Automations Sent,${data.automationsSent}`,
    `Period,${data.period}`,
  ];
  return [header, ...rows].join("\n");
}

/**
 * Export data as JSON string (formatted).
 */
export function exportToJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
