export interface CandidateState {
  discountBehavior: string;
  purchaseCyclePosition: string;
  medianOrderIntervalDays: number | null;
  nextExpectedOrderAt: Date | null;
  stateEvidence: unknown;
}

export interface CandidateDecision {
  candidate: boolean;
  reasonCode?: string;
  reasonText?: string;
  evidence: Record<string, unknown>;
  reconsiderAt?: Date | null;
  reconsiderOn?: string;
  suggestedAlternative?: "full_price_version";
}

export function evaluateCampaignCandidate(input: {
  state: CandidateState | null;
  hasDiscount: boolean;
  merchantIncluded: boolean;
}): CandidateDecision {
  const evidence =
    input.state?.stateEvidence && typeof input.state.stateEvidence === "object"
      ? (input.state.stateEvidence as Record<string, unknown>)
      : {};
  if (input.merchantIncluded) {
    return { candidate: true, reasonCode: "merchant_override", evidence };
  }
  if (
    input.hasDiscount &&
    input.state?.discountBehavior === "full_price_likely" &&
    ["early", "approaching"].includes(input.state.purchaseCyclePosition)
  ) {
    const fullPriceOrders = Number(evidence["fullPriceOrderCount"] ?? 0);
    const orderCount = Number(evidence["orderCount"] ?? fullPriceOrders);
    return {
      candidate: false,
      reasonCode: "full_price_inside_cycle",
      reasonText: `${fullPriceOrders} of ${orderCount} previous orders were at full price, and this customer is still inside their normal buying rhythm.`,
      evidence: {
        ...evidence,
        purchaseCyclePosition: input.state.purchaseCyclePosition,
        medianOrderIntervalDays: input.state.medianOrderIntervalDays,
      },
      reconsiderAt: input.state.nextExpectedOrderAt,
      reconsiderOn: "purchase_cycle_due_or_new_product_interest",
      suggestedAlternative: "full_price_version",
    };
  }
  return { candidate: true, evidence };
}
