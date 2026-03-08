import { prisma } from "@allohq/database";
import {
  createTest,
} from "@allohq/journey-orchestrator";
import type { WorkflowNode, ABTestVariable } from "@allohq/journey-orchestrator";
import type { ToolDefinition } from "../types";

export const journeyTools: ToolDefinition[] = [
  {
    name: "create_adaptive_journey",
    description:
      "Build a multi-channel adaptive journey from a natural language description. Creates an automation with adaptive channel selection, silence detection, and optional A/B testing. The journey orchestrator will automatically select the best channel per customer based on their preferences and engagement history.",
    parameters: {
      store_id: {
        type: "string",
        description: "The store ID to create the journey for",
      },
      name: {
        type: "string",
        description: "Name for the journey (e.g., 'Win-back sequence', 'Post-purchase follow-up')",
      },
      description: {
        type: "string",
        description: "Description of what the journey does",
      },
      journey_type: {
        type: "string",
        description: "Type: welcome, winback, repurchase, post_purchase, cross_sell, re_engagement",
      },
      steps: {
        type: "array",
        description: "Array of step objects: { type: 'channel_select'|'send_email'|'send_sms'|'send_whatsapp'|'wait'|'condition'|'silence_check'|'ab_test', config: {} }",
      },
      category: {
        type: "string",
        description: "Automation category (welcome_series, abandoned_cart, win_back, post_purchase, cross_sell, re_engagement)",
      },
      trigger_type: {
        type: "string",
        description: "Trigger: event, schedule, segment_entry, segment_exit",
      },
      trigger_config: {
        type: "object",
        description: "Trigger configuration (e.g., { event: 'order_created' })",
      },
      ab_test: {
        type: "object",
        description: "Optional A/B test config: { name, variable: 'subject_line'|'send_time'|'content'|'channel'|'template', variantA: { value, description }, variantB: { value, description } }",
      },
    },
    handler: async (params: Record<string, unknown>, _context) => {
      const storeId = params["store_id"] as string;
      const name = params["name"] as string;
      const description = (params["description"] as string) ?? "";
      const journeyType = (params["journey_type"] as string) ?? "welcome";
      const steps = (params["steps"] as Array<{ type: string; config: Record<string, unknown> }>) ?? [];
      const category = (params["category"] as string) ?? journeyType;
      const triggerType = (params["trigger_type"] as string) ?? "event";
      const triggerConfig = (params["trigger_config"] as Record<string, unknown>) ?? {};
      const abTestConfig = params["ab_test"] as { name: string; variable: string; variantA: { value: string; description: string }; variantB: { value: string; description: string } } | undefined;

      // Build workflow nodes
      const nodes: WorkflowNode[] = steps.map((step, i) => ({
        id: `node-${i}`,
        type: step.type as WorkflowNode["type"],
        config: step.config ?? {},
      }));

      // Get workspace for automation
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { workspaceId: true },
      });
      if (!store) {
        return { error: "Store not found" };
      }

      // Create automation record
      const automation = await prisma.automation.create({
        data: {
          workspaceId: store.workspaceId,
          storeId,
          name,
          description,
          category,
          status: "ready",
          triggerType,
          triggerConfig: JSON.parse(JSON.stringify(triggerConfig)),
          nodes: JSON.parse(JSON.stringify(nodes)),
        },
      });

      // Create A/B test if specified
      let abTestId: string | undefined;
      if (abTestConfig) {
        abTestId = await createTest({
          storeId,
          automationId: automation.id,
          name: abTestConfig.name,
          variable: abTestConfig.variable as ABTestVariable,
          variantA: abTestConfig.variantA,
          variantB: abTestConfig.variantB,
        });
      }

      return {
        automationId: automation.id,
        name,
        journeyType,
        nodeCount: nodes.length,
        nodeTypes: nodes.map((n) => n.type),
        abTestId: abTestId ?? null,
        status: "ready",
        message: `Adaptive journey "${name}" created with ${nodes.length} steps. Use activate to start it.`,
      };
    },
  },
];
