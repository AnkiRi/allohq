import { AutonomyTier, ActionStatus, type ActionResult, type ProposedAction } from "./types";
import { getAutonomyTier } from "./autonomy-config";
import { proposeAction, markExecuted } from "./action-queue";
import { scoreUrgency } from "./urgency-scorer";
import { scoreConfidence } from "./confidence-scorer";

interface RouteOptions {
  daysSinceLastOrder?: number | null;
  churnRisk?: number;
  expiresAt?: Date | null;
  inventoryLevel?: number | null;
  segmentSize?: number;
  hasCustomerState?: boolean;
  hasBrandProfile?: boolean;
}

/**
 * Route an action through the approval workflow.
 * Based on autonomy tier + confidence threshold:
 * - AUTOPILOT + high confidence → auto-execute
 * - COPILOT → queue for review
 * - ADVISOR → log as insight only
 */
export async function routeAction(
  action: ProposedAction,
  options?: RouteOptions,
): Promise<ActionResult> {
  const tier = await getAutonomyTier(action.storeId, action.category);

  const urgencyScore = scoreUrgency({
    type: action.type,
    daysSinceLastOrder: options?.daysSinceLastOrder,
    churnRisk: options?.churnRisk,
    expiresAt: options?.expiresAt ?? action.expiresAt,
    inventoryLevel: options?.inventoryLevel,
  });

  const confidenceScore = await scoreConfidence({
    storeId: action.storeId,
    type: action.type,
    segmentSize: options?.segmentSize,
    hasCustomerState: options?.hasCustomerState ?? true,
    hasBrandProfile: options?.hasBrandProfile,
  });

  // Create the action in the queue
  const result = await proposeAction(action, urgencyScore, confidenceScore);

  switch (tier) {
    case AutonomyTier.AUTOPILOT: {
      // Auto-execute if confidence is above threshold (default 70)
      const threshold = 70; // Can be made configurable per-store
      if (confidenceScore >= threshold) {
        await markExecuted(result.id);
        return { ...result, status: ActionStatus.EXECUTED, autoExecuted: true };
      }
      // Below threshold — fall through to copilot behavior
      return { ...result, status: ActionStatus.PENDING, autoExecuted: false };
    }

    case AutonomyTier.COPILOT: {
      // Queue for merchant review
      return { ...result, status: ActionStatus.PENDING, autoExecuted: false };
    }

    case AutonomyTier.ADVISOR: {
      // Log as insight only — no execution
      return { ...result, status: ActionStatus.PENDING, autoExecuted: false };
    }

    default:
      return result;
  }
}
