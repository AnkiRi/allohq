import { prisma } from "@allohq/database";
import type { ToolDefinition } from "../types";

export const campaignTools: ToolDefinition[] = [
  {
    name: "create_campaign",
    description:
      "Create an email campaign targeting a specific segment. Creates a draft campaign ready for review. The merchant should review and send it from the dashboard.",
    parameters: {
      name: {
        type: "string",
        description: "Campaign name (e.g. 'Win-Back March 2026')",
      },
      segmentName: {
        type: "string",
        description: "Target segment name (e.g. 'At Risk', 'Champions')",
      },
      templateId: {
        type: "string",
        description: "Optional email template ID to use. If not provided, a default will be selected.",
      },
    },
    handler: async (params, ctx) => {
      const name = String(params.name ?? "Agent Campaign");
      const segmentName = String(params.segmentName ?? "");

      // Find the segment
      const segment = segmentName
        ? await prisma.customerSegment.findFirst({
            where: { storeId: ctx.storeId, name: { contains: segmentName, mode: "insensitive" } },
          })
        : null;

      // Find workspace for the store
      const store = await prisma.store.findFirst({
        where: { id: ctx.storeId },
        select: { workspaceId: true },
      });

      if (!store) {
        return { success: false, message: "Store not found" };
      }

      // Find a template — use provided ID or pick the most recent one
      let templateId = params.templateId ? String(params.templateId) : null;
      if (!templateId) {
        const template = await prisma.emailTemplate.findFirst({
          where: { workspaceId: store.workspaceId },
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        });
        templateId = template?.id ?? null;
      }

      if (!templateId) {
        return {
          success: false,
          message: "No email template found. Create a template first before creating a campaign.",
        };
      }

      const campaign = await prisma.campaign.create({
        data: {
          workspaceId: store.workspaceId,
          storeId: ctx.storeId,
          name,
          templateId,
          segmentId: segment?.id,
          status: "draft",
          recipientCount: segment?.customerCount ?? 0,
        },
      });

      // Log action
      await prisma.agentAction.create({
        data: {
          storeId: ctx.storeId,
          agentType: "retention_strategist",
          actionType: "create_campaign",
          input: { name, segmentName, templateId },
          output: { campaignId: campaign.id },
          status: "completed",
        },
      });

      return {
        success: true,
        campaignId: campaign.id,
        name: campaign.name,
        segment: segment?.name ?? "All customers",
        recipientCount: campaign.recipientCount,
        status: "draft",
        message: `Campaign "${name}" created as draft targeting ${segment?.name ?? "all customers"} (${campaign.recipientCount} recipients). Review and send from the Campaigns page.`,
      };
    },
  },
];
