import { prisma } from "@allohq/database";
import type { ToolDefinition } from "../types";
import { Queue } from "bullmq";
import {
  automationActivationChecksum,
  loadAutomationActivationSnapshot,
} from "@allohq/campaign-engine";
import { assertV1EmailAutomation } from "@allohq/release-gate";
import { buildDefaultNodes } from "./automation-skeleton";

const automationGenerateQueue = new Queue("automation-generate", {
  connection: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
  },
});

export const automationTools: ToolDefinition[] = [
  {
    name: "create_automation",
    description:
      "Create a new automation workflow (e.g. win-back, welcome series, abandoned cart). Creates it as a draft for the merchant to review and activate.",
    parameters: {
      name: { type: "string", description: "Automation name (e.g. 'Win-Back Flow')" },
      category: {
        type: "string",
        description:
          "Category: 'welcome_series', 'abandoned_cart', 'win_back', 'post_purchase', 'birthday', 'browse_abandonment', 'vip_reward', 'custom'",
      },
      description: { type: "string", description: "What this automation does" },
      triggerType: {
        type: "string",
        description:
          "Trigger type: 'event' (e.g. order placed), 'schedule' (time-based), 'segment_entry' (customer enters segment), 'segment_exit' (customer leaves segment)",
      },
      triggerConfig: {
        type: "object",
        description:
          "Trigger configuration — e.g. { event: 'order.created' } or { segment: 'At Risk' } or { schedule: 'daily' }",
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

      // The skeleton defines timing only. The generator creates every email
      // from the merchant's current BrandProfile and replaces these nodes with
      // template-backed, email-only steps before activation is possible.
      await automationGenerateQueue.add(
        "generate",
        { automationId: automation.id, storeId: ctx.storeId },
        {
          attempts: 2,
          backoff: { type: "exponential", delay: 5000 },
          jobId: `brand-automation-${automation.id}`,
        }
      );

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
      automationName: {
        type: "string",
        description: "Name (or partial name) of the automation to look up",
      },
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
        case "activate": {
          if (automation.status !== "ready") {
            return {
              success: false,
              message: `Automation "${automation.name}" must finish brand generation and be ready before activation.`,
            };
          }
          assertV1EmailAutomation(automation);
          const snapshot = await loadAutomationActivationSnapshot(automation.id);
          if (!snapshot)
            return {
              success: false,
              message: "Automation activation snapshot could not be created.",
            };
          const activationChecksum = automationActivationChecksum(snapshot);
          const version = automation.activeVersion + 1;
          await prisma.$transaction(async (tx) => {
            await tx.automationVersion.create({
              data: {
                automationId: automation.id,
                version,
                activationChecksum,
                snapshot: snapshot as any,
              },
            });
            await tx.automation.update({
              where: { id: automation.id },
              data: {
                status: "active",
                activationChecksum,
                activatedAt: new Date(),
                activeVersion: version,
              },
            });
          });
          newStatus = "active";
          break;
        }
        case "resume": {
          if (automation.status !== "paused") {
            return {
              success: false,
              message: `Automation "${automation.name}" must be paused before it can resume.`,
            };
          }
          assertV1EmailAutomation(automation);
          const snapshot = await loadAutomationActivationSnapshot(automation.id);
          const checksum = snapshot ? automationActivationChecksum(snapshot) : null;
          if (!checksum || checksum !== automation.activationChecksum) {
            return {
              success: false,
              message: "This journey changed after approval. Review and activate it again.",
            };
          }
          newStatus = "active";
          break;
        }
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

      if (action !== "activate") {
        await prisma.automation.update({
          where: { id: automation.id },
          data: { status: newStatus },
        });
      }

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
        description:
          "Updates to apply: { type?: string, config?: { days?: number, hours?: number, subject?: string, message?: string, check?: string } }",
      },
    },
    handler: async (params, ctx) => {
      const automation = await prisma.automation.findFirst({
        where: {
          storeId: ctx.storeId,
          name: { contains: String(params.automationName ?? ""), mode: "insensitive" },
        },
      });
      if (!automation)
        return { success: false, message: `Automation "${params.automationName}" not found` };

      const nodes = (automation.nodes as any[]) ?? [];
      const nodeId = String(params.nodeId);
      const nodeIndex = nodes.findIndex((n) => n.id === nodeId);
      if (nodeIndex === -1)
        return { success: false, message: `Node "${nodeId}" not found in automation` };

      const updates = (params.updates as Record<string, unknown>) ?? {};
      const node = { ...nodes[nodeIndex] };
      if (updates.type) node.type = updates.type;
      if (updates.config)
        node.config = { ...node.config, ...(updates.config as Record<string, unknown>) };

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
