/** Compatibility adapter: the only churn formula lives in customer-state. */
import { estimateChurnRisk, type ChurnRiskInput } from "@allohq/customer-state";
export type ChurnModelInput = ChurnRiskInput & { smsClickRate?: number | null };
export interface ChurnPrediction {
  riskEstimate: number;
  /** @deprecated This heuristic is not a calibrated probability. */
  probability: number;
  riskTier: "low" | "medium" | "high" | "critical";
  explanations: string[];
  signalBreakdown: Record<string, number>;
  modelKind: "heuristic_v1";
}
export function predictChurn(input: ChurnModelInput): ChurnPrediction {
  const estimate = estimateChurnRisk(input);
  return { ...estimate, probability: estimate.riskEstimate };
}
