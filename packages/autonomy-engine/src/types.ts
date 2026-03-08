export enum AutonomyTier {
  AUTOPILOT = "autopilot",
  COPILOT = "copilot",
  ADVISOR = "advisor",
}

export enum ActionCategory {
  CART_RECOVERY = "cart_recovery",
  WIN_BACK = "win_back",
  POST_PURCHASE = "post_purchase",
  REPURCHASE = "repurchase",
  WELCOME = "welcome",
  PROMOTIONAL = "promotional",
  VIP = "vip",
  CROSS_SELL = "cross_sell",
  SUPPORT = "support",
}

export enum ActionStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  EXECUTED = "executed",
  EXPIRED = "expired",
  FAILED = "failed",
}

export interface ProposedAction {
  storeId: string;
  type: string;
  category: ActionCategory;
  reasoning: string;
  estimatedRevenue?: number;
  payload: Record<string, unknown>;
  expiresAt?: Date;
}

export interface ActionResult {
  id: string;
  status: ActionStatus;
  autoExecuted: boolean;
}

export interface AutonomyConfigData {
  storeId: string;
  category: ActionCategory;
  tier: AutonomyTier;
  settings: {
    confidenceThreshold?: number;
    requiresApproval?: boolean;
  };
}

// Default autonomy matrix — recommended starting tiers per category
export const DEFAULT_AUTONOMY_MATRIX: Record<ActionCategory, AutonomyTier> = {
  [ActionCategory.CART_RECOVERY]: AutonomyTier.AUTOPILOT,
  [ActionCategory.WIN_BACK]: AutonomyTier.COPILOT,
  [ActionCategory.POST_PURCHASE]: AutonomyTier.AUTOPILOT,
  [ActionCategory.REPURCHASE]: AutonomyTier.COPILOT,
  [ActionCategory.WELCOME]: AutonomyTier.AUTOPILOT,
  [ActionCategory.PROMOTIONAL]: AutonomyTier.COPILOT,
  [ActionCategory.VIP]: AutonomyTier.COPILOT,
  [ActionCategory.CROSS_SELL]: AutonomyTier.COPILOT,
  [ActionCategory.SUPPORT]: AutonomyTier.ADVISOR,
};
