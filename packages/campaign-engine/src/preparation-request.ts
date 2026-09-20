import type { HoldoutRateDecision } from "@allohq/customer-state";

/**
 * The durable contract between an approval request and the worker that
 * prepares it.
 *
 * Everything the worker needs to resolve the audience and finalise the
 * approval travels in the job, so a restarted worker needs no request context
 * to continue. It carries no audience data — only identifiers, policy inputs
 * and the preflight receipt the merchant's request already produced.
 */
export interface CampaignPreparationRequest {
  prepareAudience: true;
  campaignId: string;
  storeId: string;
  /** Deterministic per campaign state: retries join, they do not compete. */
  runKey: string;
  experimentId: string;
  assignmentSeed: string;
  family: string;
  policyRate: number;
  policyReason: HoldoutRateDecision["reason"];
  /** Pooled causal evidence, passed back to the rate policy unchanged. */
  evidence: {
    measurementReadyNonOverlappingUnits: number;
    pooledCiLow: number | null;
    pooledCiHigh: number | null;
  } | null;
  deliveryProvider: "resend" | "ses";
  emailPreflightReceipt: Record<string, unknown>;
  forceImmediate: boolean;
  approvedBy: string | null;
}
