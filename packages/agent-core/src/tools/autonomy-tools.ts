import { prisma } from "@allohq/database";
import {
  setAutonomyTier,
  listPendingActions,
  approveAction,
  rejectAction,
  getActionById,
  AutonomyTier,
  ActionCategory,
  ActionStatus,
} from "@allohq/autonomy-engine";
import { computeFullState } from "@allohq/customer-state";
import type { ToolDefinition } from "../types";

export const autonomyTools: ToolDefinition[] = [
  {
    name: "get_customer_state",
    description:
      "Fetch the unified CustomerState for a customer, including lifecycle stage, churn risk, intent, channel preference, fatigue, VIP level, and campaign eligibility. Use when the merchant asks about a specific customer.",
    parameters: {
      customer_id: { type: "string", description: "The customer ID to look up" },
      recalculate: { type: "boolean", description: "If true, recalculate from scratch instead of using cached state" },
    },
    handler: async (params, ctx) => {
      const customerId = params.customer_id as string;
      if (!customerId) return { error: "customer_id is required" };

      if (params.recalculate) {
        const state = await computeFullState(customerId, ctx.storeId);
        return state;
      }

      const state = await prisma.customerState.findUnique({
        where: { customerId },
      });

      if (!state) {
        // Compute on first access
        const computed = await computeFullState(customerId, ctx.storeId);
        return computed;
      }

      return {
        customerId: state.customerId,
        lifecycleStage: state.lifecycleStage,
        churnRisk: state.churnRisk,
        intentState: state.intentState,
        channelPreference: state.channelPreference,
        optimalSendWindow: state.optimalSendWindow,
        communicationFatigue: state.communicationFatigue,
        discountSensitivity: state.discountSensitivity,
        supportState: state.supportState,
        trustScore: state.trustScore,
        vipLevel: state.vipLevel,
        campaignEligibility: state.campaignEligibility,
        lastStateUpdate: state.lastStateUpdate,
      };
    },
  },

  {
    name: "configure_autonomy",
    description:
      "Change the autonomy tier for a category. Valid tiers: autopilot (AI acts independently), copilot (AI drafts, merchant approves), advisor (AI suggests only). Valid categories: cart_recovery, win_back, post_purchase, repurchase, welcome, promotional, vip, cross_sell, support.",
    parameters: {
      category: { type: "string", description: "The action category to configure" },
      tier: { type: "string", description: "The autonomy tier: autopilot, copilot, or advisor" },
    },
    handler: async (params, ctx) => {
      const category = params.category as string;
      const tier = params.tier as string;

      if (!Object.values(ActionCategory).includes(category as ActionCategory)) {
        return { error: `Invalid category. Valid: ${Object.values(ActionCategory).join(", ")}` };
      }
      if (!Object.values(AutonomyTier).includes(tier as AutonomyTier)) {
        return { error: `Invalid tier. Valid: ${Object.values(AutonomyTier).join(", ")}` };
      }

      const result = await setAutonomyTier(
        ctx.storeId,
        category as ActionCategory,
        tier as AutonomyTier,
      );
      return { success: true, ...result };
    },
  },

  {
    name: "manage_guardrails",
    description:
      "View or edit guardrail rules for the store. Use action 'list' to see all rules, 'create' to add a rule, 'update' to modify, 'delete' to remove. Rule types: max_discount, max_sends_per_week, blocked_words, quiet_hours, spending_cap.",
    parameters: {
      action: { type: "string", description: "list, create, update, or delete" },
      id: { type: "string", description: "Guardrail ID (for update/delete)" },
      rule_type: { type: "string", description: "Rule type (for create)" },
      rule_value: { type: "object", description: "Rule value object (for create/update)" },
      is_active: { type: "boolean", description: "Whether rule is active (for update)" },
    },
    handler: async (params, ctx) => {
      const action = params.action as string;

      switch (action) {
        case "list": {
          const rules = await prisma.guardrail.findMany({
            where: { storeId: ctx.storeId },
          });
          return { rules, count: rules.length };
        }

        case "create": {
          const ruleType = params.rule_type as string;
          const ruleValue = params.rule_value as Record<string, unknown>;
          if (!ruleType || !ruleValue) return { error: "rule_type and rule_value required" };

          const rule = await prisma.guardrail.create({
            data: {
              storeId: ctx.storeId,
              ruleType,
              ruleValue: ruleValue as any,
            },
          });
          return { success: true, rule };
        }

        case "update": {
          const id = params.id as string;
          if (!id) return { error: "id required" };

          const data: Record<string, unknown> = {};
          if (params.rule_value) data.ruleValue = params.rule_value;
          if (params.is_active !== undefined) data.isActive = params.is_active;

          const updated = await prisma.guardrail.update({
            where: { id },
            data,
          });
          return { success: true, rule: updated };
        }

        case "delete": {
          const delId = params.id as string;
          if (!delId) return { error: "id required" };
          await prisma.guardrail.delete({ where: { id: delId } });
          return { success: true };
        }

        default:
          return { error: "Invalid action. Use: list, create, update, delete" };
      }
    },
  },

  {
    name: "review_action_queue",
    description:
      "List pending AI-proposed actions waiting for merchant review. Shows urgency score, confidence, reasoning, and estimated revenue for each action.",
    parameters: {
      status: { type: "string", description: "Filter by status: pending, approved, rejected, executed, expired" },
      limit: { type: "number", description: "Max items to return (default 10)" },
    },
    handler: async (params, ctx) => {
      const status = params.status as string | undefined;
      const limit = (params.limit as number) ?? 10;

      const result = await listPendingActions(ctx.storeId, {
        status: status as ActionStatus | undefined,
        limit,
      });

      return {
        actions: result.actions.map((a) => ({
          id: a.id,
          type: a.type,
          category: a.category,
          status: a.status,
          urgencyScore: a.urgencyScore,
          confidenceScore: a.confidenceScore,
          reasoning: a.reasoning,
          estimatedRevenue: a.estimatedRevenue,
          expiresAt: a.expiresAt,
          createdAt: a.createdAt,
        })),
        total: result.total,
      };
    },
  },

  {
    name: "approve_action",
    description:
      "Approve or reject a queued action. Use action 'approve' to approve for execution, or 'reject' to reject with a reason.",
    parameters: {
      action_id: { type: "string", description: "The action queue ID" },
      decision: { type: "string", description: "'approve' or 'reject'" },
      reason: { type: "string", description: "Reason for rejection (required when rejecting)" },
    },
    handler: async (params, _ctx) => {
      const actionId = params.action_id as string;
      const decision = params.decision as string;

      if (!actionId) return { error: "action_id required" };

      const action = await getActionById(actionId);
      if (!action) return { error: "Action not found" };
      if (action.status !== "pending") return { error: `Action is already ${action.status}` };

      if (decision === "approve") {
        await approveAction(actionId, "ai-agent");
        return { success: true, message: "Action approved and queued for execution" };
      } else if (decision === "reject") {
        const reason = (params.reason as string) || "Rejected by merchant via AI chat";
        await rejectAction(actionId, "ai-agent", reason);
        return { success: true, message: "Action rejected" };
      }

      return { error: "decision must be 'approve' or 'reject'" };
    },
  },
];
