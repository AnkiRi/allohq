export interface ChurnRiskInput { daysSinceLastOrder: number | null; orderCount: number; totalSpend: number; avgOrderIntervalDays: number | null; emailOpenRate?: number | null; emailClickRate?: number | null; daysSinceLastBrowse?: number | null; }
export interface ChurnRiskEstimate { riskEstimate: number; riskTier: "low" | "medium" | "high" | "critical"; explanations: string[]; signalBreakdown: Record<string, number>; modelKind: "heuristic_v1"; }
const sigmoid = (x: number, mid: number, k: number) => 1 / (1 + Math.exp(-k * (x - mid)));
/** Transparent deterministic risk score. It is deliberately not called a probability until calibrated. */
export function estimateChurnRisk(input: ChurnRiskInput): ChurnRiskEstimate {
  const signalBreakdown: Record<string, number> = {
    recency: input.daysSinceLastOrder === null ? .9 : sigmoid(input.daysSinceLastOrder, 90, .03),
    frequency: 1 - sigmoid(input.orderCount, 4, .8),
    monetary: 1 - sigmoid(input.totalSpend, 150, .015),
    overdue: input.avgOrderIntervalDays && input.daysSinceLastOrder !== null ? sigmoid(input.daysSinceLastOrder / input.avgOrderIntervalDays, 1.5, 2) : .5,
    emailEngagement: input.emailOpenRate == null ? .5 : Math.max(0, 1 - sigmoid(input.emailOpenRate, .2, 10) - ((input.emailClickRate ?? 0) > .05 ? .15 : 0)),
    browseRecency: input.daysSinceLastBrowse == null ? .5 : Math.max(0, sigmoid(input.daysSinceLastBrowse, 30, .08) - (input.daysSinceLastBrowse <= 7 ? .2 : 0)),
  };
  const weights = { recency: .30, frequency: .20, monetary: .10, overdue: .15, emailEngagement: .15, browseRecency: .10 };
  const riskEstimate = Math.min(1, Math.max(0, Math.round(Object.entries(weights).reduce((s, [k, w]) => s + (signalBreakdown[k] ?? .5) * w, 0) * 1000) / 1000));
  const riskTier = riskEstimate >= .75 ? "critical" : riskEstimate >= .5 ? "high" : riskEstimate >= .3 ? "medium" : "low";
  const explanations = [input.daysSinceLastOrder === null ? "No purchase history" : input.daysSinceLastOrder > 120 ? `No order in ${Math.round(input.daysSinceLastOrder)} days` : null, input.orderCount <= 1 ? "No established repeat-purchase pattern" : null].filter((x): x is string => Boolean(x));
  if (!explanations.length) explanations.push(riskEstimate < .3 ? "Healthy recency and engagement signals" : "Several moderate risk signals");
  return { riskEstimate, riskTier, explanations, signalBreakdown, modelKind: "heuristic_v1" };
}
