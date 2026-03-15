import { prisma } from "@allohq/database";
import type { ToolDefinition } from "../types";

export const automationTools: ToolDefinition[] = [
  {
    name: "create_automation",
    description:
      "Create a new automation workflow (e.g. win-back, welcome series, abandoned cart). Creates it as a draft for the merchant to review and activate.",
    parameters: {
      name: { type: "string", description: "Automation name (e.g. 'Win-Back Flow')" },
      category: {
        type: "string",
        description: "Category: 'welcome_series', 'abandoned_cart', 'win_back', 'post_purchase', 'birthday', 'browse_abandonment', 'vip_reward', 'custom'",
      },
      description: { type: "string", description: "What this automation does" },
      triggerType: {
        type: "string",
        description: "Trigger type: 'event' (e.g. order placed), 'schedule' (time-based), 'segment_entry' (customer enters segment), 'segment_exit' (customer leaves segment)",
      },
      triggerConfig: {
        type: "object",
        description: "Trigger configuration — e.g. { event: 'order.created' } or { segment: 'At Risk' } or { schedule: 'daily' }",
      },
    },
    handler: async (params, ctx) => {
      const name = String(params.name ?? "New Automation");
      const category = String(params.category ?? "custom");
      const description = String(params.description ?? "");
      const triggerType = String(params.triggerType ?? "event");
      const triggerConfig = (params.triggerConfig as Record<string, unknown>) ?? {};

      // Get workspace
      const store = await prisma.store.findFirst({
        where: { id: ctx.storeId },
        select: { workspaceId: true },
      });
      if (!store) return { success: false, message: "Store not found" };

      // Build default workflow nodes based on category
      const nodes = buildDefaultNodes(category);

      const automation = await prisma.automation.create({
        data: {
          workspaceId: store.workspaceId,
          storeId: ctx.storeId,
          name,
          description,
          category,
          status: "draft",
          triggerType,
          triggerConfig: triggerConfig as any,
          nodes: nodes as any,
        },
      });

      // Log action
      await prisma.agentAction.create({
        data: {
          storeId: ctx.storeId,
          agentType: "retention_strategist",
          actionType: "create_automation",
          input: { name, category, triggerType },
          output: { automationId: automation.id },
          status: "completed",
        },
      });

      return {
        success: true,
        automationId: automation.id,
        name: automation.name,
        category,
        status: "draft",
        triggerType,
        nodeCount: (nodes as unknown[]).length,
        message: `Automation "${name}" created as draft. It has ${(nodes as unknown[]).length} workflow steps. Review and activate it from the Automations page.`,
      };
    },
  },

  {
    name: "get_automation_details",
    description:
      "Get full details about an automation — its workflow steps, trigger, status, and associated templates. Use this when the merchant asks to preview, view, or see details about an automation.",
    parameters: {
      automationName: { type: "string", description: "Name (or partial name) of the automation to look up" },
    },
    handler: async (params, ctx) => {
      const automationName = String(params.automationName ?? "");

      const automation = await prisma.automation.findFirst({
        where: {
          storeId: ctx.storeId,
          name: { contains: automationName, mode: "insensitive" },
        },
      });

      if (!automation) {
        // Try broader search — list all automations for this store
        const allAutomations = await prisma.automation.findMany({
          where: { storeId: ctx.storeId },
          select: { id: true, name: true, status: true, category: true },
        });
        return {
          success: false,
          message: `Automation "${automationName}" not found.`,
          availableAutomations: allAutomations.map((a) => `${a.name} (${a.status})`),
        };
      }

      const nodes = (automation.nodes as any[]) ?? [];

      // Fetch associated templates
      const templateIds = (automation.templateIds as string[]) ?? [];
      let templates: { id: string; name: string; subject: string | null }[] = [];
      if (templateIds.length > 0) {
        templates = await prisma.emailTemplate.findMany({
          where: { id: { in: templateIds } },
          select: { id: true, name: true, subject: true },
        });
      }

      return {
        success: true,
        automationId: automation.id,
        name: automation.name,
        description: automation.description,
        category: automation.category,
        status: automation.status,
        triggerType: automation.triggerType,
        triggerConfig: automation.triggerConfig,
        workflowSteps: nodes.map((n: any, i: number) => ({
          step: i + 1,
          id: n.id,
          type: n.type,
          config: n.config,
        })),
        totalSteps: nodes.length,
        templates: templates.map((t) => ({ id: t.id, name: t.name, subject: t.subject })),
        message: `Automation "${automation.name}" has ${nodes.length} workflow steps and is currently "${automation.status}".`,
      };
    },
  },

  {
    name: "modify_automation",
    description:
      "Modify an existing automation — pause, resume, activate, or update its configuration.",
    parameters: {
      automationName: { type: "string", description: "Name of the automation to modify" },
      action: {
        type: "string",
        description: "Action: 'activate', 'pause', 'resume', 'delete'",
      },
    },
    handler: async (params, ctx) => {
      const automationName = String(params.automationName ?? "");
      const action = String(params.action ?? "");

      const automation = await prisma.automation.findFirst({
        where: {
          storeId: ctx.storeId,
          name: { contains: automationName, mode: "insensitive" },
        },
      });

      if (!automation) {
        return { success: false, message: `Automation "${automationName}" not found` };
      }

      let newStatus: string;
      switch (action) {
        case "activate":
        case "resume":
          newStatus = "active";
          break;
        case "pause":
          newStatus = "paused";
          break;
        case "delete":
          await prisma.automation.delete({ where: { id: automation.id } });
          return {
            success: true,
            message: `Automation "${automation.name}" has been deleted.`,
          };
        default:
          return { success: false, message: `Unknown action: ${action}` };
      }

      await prisma.automation.update({
        where: { id: automation.id },
        data: { status: newStatus },
      });

      // Log action
      await prisma.agentAction.create({
        data: {
          storeId: ctx.storeId,
          agentType: "retention_strategist",
          actionType: "modify_automation",
          input: { automationId: automation.id, action },
          output: { newStatus },
          status: "completed",
        },
      });

      return {
        success: true,
        automationId: automation.id,
        name: automation.name,
        previousStatus: automation.status,
        newStatus,
        message: `Automation "${automation.name}" has been ${action === "activate" ? "activated" : action === "pause" ? "paused" : "resumed"}.`,
      };
    },
  },
  {
    name: "edit_automation_node",
    description:
      "Edit a specific node in an automation workflow. Use this to change delay durations, conditions, or other node configurations.",
    parameters: {
      automationName: { type: "string", description: "Name of the automation" },
      nodeId: { type: "string", description: "ID of the node to edit (e.g. '1', '2', '3')" },
      updates: {
        type: "object",
        description: "Updates to apply: { type?: string, config?: { days?: number, hours?: number, subject?: string, message?: string, check?: string } }",
      },
    },
    handler: async (params, ctx) => {
      const automation = await prisma.automation.findFirst({
        where: {
          storeId: ctx.storeId,
          name: { contains: String(params.automationName ?? ""), mode: "insensitive" },
        },
      });
      if (!automation) return { success: false, message: `Automation "${params.automationName}" not found` };

      const nodes = (automation.nodes as any[]) ?? [];
      const nodeId = String(params.nodeId);
      const nodeIndex = nodes.findIndex((n) => n.id === nodeId);
      if (nodeIndex === -1) return { success: false, message: `Node "${nodeId}" not found in automation` };

      const updates = (params.updates as Record<string, unknown>) ?? {};
      const node = { ...nodes[nodeIndex] };
      if (updates.type) node.type = updates.type;
      if (updates.config) node.config = { ...node.config, ...(updates.config as Record<string, unknown>) };

      nodes[nodeIndex] = node;

      await prisma.automation.update({
        where: { id: automation.id },
        data: { nodes: nodes as any },
      });

      await prisma.agentAction.create({
        data: {
          storeId: ctx.storeId,
          agentType: "retention_strategist",
          actionType: "edit_automation_node",
          input: { automationId: automation.id, nodeId, updates } as any,
          output: { updatedNode: node },
          status: "completed",
        },
      });

      return {
        success: true,
        automationId: automation.id,
        nodeId,
        updatedNode: node,
        message: `Node ${nodeId} in "${automation.name}" updated successfully.`,
      };
    },
  },
];

/** Build default workflow nodes based on automation category */
function buildDefaultNodes(category: string): unknown[] {
  switch (category) {
    case "win_back":
      return [
        { id: "1", type: "delay", config: { days: 0 }, next: "2" },
        { id: "2", type: "send_email", config: { subject: "We miss you!" }, next: "3" },
        { id: "3", type: "delay", config: { days: 3 }, next: "4" },
        { id: "4", type: "condition", config: { check: "opened_email" }, nextYes: "5", nextNo: "6" },
        { id: "5", type: "send_email", config: { subject: "Special offer just for you" }, next: null },
        { id: "6", type: "send_sms", config: { message: "We have a special offer for you" }, next: null },
      ];
    case "welcome_series":
      return [
        { id: "1", type: "send_email", config: { subject: "Welcome!" }, next: "2" },
        { id: "2", type: "delay", config: { days: 2 }, next: "3" },
        { id: "3", type: "send_email", config: { subject: "Here are our bestsellers" }, next: "4" },
        { id: "4", type: "delay", config: { days: 5 }, next: "5" },
        { id: "5", type: "send_email", config: { subject: "Your exclusive welcome offer" }, next: null },
      ];
    case "abandoned_cart":
      return [
        { id: "1", type: "delay", config: { hours: 1 }, next: "2" },
        { id: "2", type: "send_email", config: { subject: "You left something behind" }, next: "3" },
        { id: "3", type: "delay", config: { days: 1 }, next: "4" },
        { id: "4", type: "send_email", config: { subject: "Your cart is waiting" }, next: null },
      ];
    case "post_purchase":
      return [
        { id: "1", type: "delay", config: { days: 3 }, next: "2" },
        { id: "2", type: "send_email", config: { subject: "How's your order?" }, next: "3" },
        { id: "3", type: "delay", config: { days: 14 }, next: "4" },
        { id: "4", type: "send_email", config: { subject: "We'd love your review" }, next: null },
      ];
    default:
      return [
        { id: "1", type: "delay", config: { days: 0 }, next: "2" },
        { id: "2", type: "send_email", config: { subject: "Hello" }, next: null },
      ];
  }
}
