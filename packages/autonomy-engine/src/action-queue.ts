import { prisma } from "@allohq/database";
import { ActionStatus, type ProposedAction, type ActionResult } from "./types";

/**
 * Propose a new action and add it to the queue.
 */
export async function proposeAction(
  action: ProposedAction,
  urgencyScore: number,
  confidenceScore: number,
): Promise<ActionResult> {
  // Dedup: skip if an identical pending/approved action already exists
  const existing = await prisma.actionQueue.findFirst({
    where: {
      storeId: action.storeId,
      type: action.type,
      ...(action.category ? { category: action.category } : {}),
      status: { in: [ActionStatus.PENDING, ActionStatus.APPROVED] },
    },
  });
  if (existing) {
    return { id: existing.id, status: existing.status as ActionStatus, autoExecuted: false };
  }

  const record = await prisma.actionQueue.create({
    data: {
      storeId: action.storeId,
      type: action.type,
      category: action.category,
      status: ActionStatus.PENDING,
      urgencyScore,
      confidenceScore,
      reasoning: action.reasoning,
      estimatedRevenue: action.estimatedRevenue ?? null,
      payload: action.payload as any,
      expiresAt: action.expiresAt ?? null,
    },
  });

  return {
    id: record.id,
    status: ActionStatus.PENDING,
    autoExecuted: false,
  };
}

/**
 * List pending actions for a store with optional filters.
 */
export async function listPendingActions(
  storeId: string,
  options?: {
    status?: ActionStatus;
    category?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{
  actions: Array<{
    id: string;
    type: string;
    category: string | null;
    status: string;
    urgencyScore: number;
    confidenceScore: number;
    reasoning: string;
    estimatedRevenue: number | null;
    payload: unknown;
    expiresAt: Date | null;
    createdAt: Date;
  }>;
  total: number;
}> {
  const where = {
    storeId,
    ...(options?.status && { status: options.status }),
    ...(options?.category && { category: options.category }),
  };

  const [actions, total] = await Promise.all([
    prisma.actionQueue.findMany({
      where,
      orderBy: [{ urgencyScore: "desc" }, { createdAt: "desc" }],
      take: options?.limit ?? 20,
      skip: options?.offset ?? 0,
    }),
    prisma.actionQueue.count({ where }),
  ]);

  return { actions, total };
}

/**
 * Approve an action and mark it for execution.
 */
export async function approveAction(
  actionId: string,
  reviewedBy: string,
  note?: string,
): Promise<void> {
  await prisma.actionQueue.update({
    where: { id: actionId },
    data: {
      status: ActionStatus.APPROVED,
      reviewedBy,
      reviewedAt: new Date(),
      reviewNote: note ?? null,
    },
  });
}

/**
 * Reject an action with a reason.
 */
export async function rejectAction(
  actionId: string,
  reviewedBy: string,
  reason: string,
): Promise<void> {
  await prisma.actionQueue.update({
    where: { id: actionId },
    data: {
      status: ActionStatus.REJECTED,
      reviewedBy,
      reviewedAt: new Date(),
      reviewNote: reason,
    },
  });
}

/**
 * Mark an action as executed (after auto-execution or post-approval execution).
 */
export async function markExecuted(actionId: string): Promise<void> {
  await prisma.actionQueue.update({
    where: { id: actionId },
    data: { status: ActionStatus.EXECUTED },
  });
}

/**
 * Expire actions that have passed their expiresAt timestamp.
 */
export async function expireStaleActions(storeId: string): Promise<number> {
  const result = await prisma.actionQueue.updateMany({
    where: {
      storeId,
      status: ActionStatus.PENDING,
      expiresAt: { lt: new Date() },
    },
    data: { status: ActionStatus.EXPIRED },
  });
  return result.count;
}

/**
 * Get a single action by ID.
 */
export async function getActionById(actionId: string) {
  return prisma.actionQueue.findUnique({ where: { id: actionId } });
}

/**
 * Bulk approve multiple actions.
 */
export async function bulkApprove(
  actionIds: string[],
  reviewedBy: string,
): Promise<number> {
  const result = await prisma.actionQueue.updateMany({
    where: {
      id: { in: actionIds },
      status: ActionStatus.PENDING,
    },
    data: {
      status: ActionStatus.APPROVED,
      reviewedBy,
      reviewedAt: new Date(),
    },
  });
  return result.count;
}

/**
 * Bulk reject multiple actions.
 */
export async function bulkReject(
  actionIds: string[],
  reviewedBy: string,
  reason: string,
): Promise<number> {
  const result = await prisma.actionQueue.updateMany({
    where: {
      id: { in: actionIds },
      status: ActionStatus.PENDING,
    },
    data: {
      status: ActionStatus.REJECTED,
      reviewedBy,
      reviewedAt: new Date(),
      reviewNote: reason,
    },
  });
  return result.count;
}

/**
 * Execute an approved action — creates the actual campaign/automation.
 */
export async function executeApprovedAction(
  actionId: string,
): Promise<{ executedType: string; resultId?: string }> {
  const action = await prisma.actionQueue.findUnique({ where: { id: actionId } });
  if (!action || (action.status !== ActionStatus.APPROVED && action.status !== ActionStatus.EXECUTED)) {
    throw new Error("Action not approved or not found");
  }
  if (action.status === ActionStatus.EXECUTED) {
    return { executedType: action.type };
  }

  const payload = action.payload as Record<string, unknown>;

  if (action.type === "campaign_send") {
    // Get store's workspaceId
    const store = await prisma.store.findUnique({ where: { id: action.storeId }, select: { workspaceId: true } });
    if (!store) throw new Error("Store not found for action");

    // Create a template from the payload if no templateId exists
    let templateId = payload.templateId as string | undefined;
    if (!templateId) {
      const subject = (payload.subject as string) || (payload.campaignName as string) || "Campaign";
      // Build blocks from the draft's content slots if available
      const draft = payload.draft as Record<string, unknown> | undefined;
      const contentSlots = (payload.contentSlots ?? draft?.contentSlots) as Record<string, unknown> | undefined;
      let blocks: unknown[] = [];
      if (contentSlots) {
        // Convert content slots into email builder blocks
        if (contentSlots.headline) {
          blocks.push({ type: "heading", props: { text: contentSlots.headline as string, level: 1 } });
        }
        if (contentSlots.bodyText) {
          blocks.push({ type: "text", props: { text: contentSlots.bodyText as string } });
        }
        const products = contentSlots.products as Array<Record<string, unknown>> | undefined;
        if (products?.length) {
          for (const p of products) {
            blocks.push({ type: "product", props: { productId: p.id ?? p.productId, title: p.title, price: p.price, imageUrl: p.imageUrl } });
          }
        }
        if (contentSlots.ctaText && contentSlots.ctaUrl) {
          blocks.push({ type: "button", props: { text: contentSlots.ctaText as string, url: contentSlots.ctaUrl as string } });
        }
      }
      // Also try to get blocks directly from the draft
      if (blocks.length === 0 && draft?.blocks && Array.isArray(draft.blocks)) {
        blocks = draft.blocks as unknown[];
      }
      const template = await prisma.emailTemplate.create({
        data: {
          workspaceId: store.workspaceId,
          name: (payload.campaignName as string) || "AI Campaign",
          subject,
          blocks: (blocks.length > 0 ? blocks : []) as any,
          html: (payload.htmlPreview as string) || (draft?.html as string) || null,
          category: "ai_generated",
        },
      });
      templateId = template.id;
    }

    const campaign = await prisma.campaign.create({
      data: {
        workspaceId: store.workspaceId,
        storeId: action.storeId,
        name: (payload.campaignName as string) || (payload.name as string) || "AI Campaign",
        templateId,
        status: "draft",
      },
    });
    await markExecuted(actionId);
    return { executedType: "campaign", resultId: campaign.id };
  }

  if (action.type === "automation_draft") {
    const automationId = payload.automationId as string | undefined;
    if (automationId) {
      await prisma.automation.updateMany({
        where: { id: automationId, status: { not: "active" } },
        data: { status: "active" },
      });
    }
    await markExecuted(actionId);
    return { executedType: "automation", resultId: automationId };
  }

  await markExecuted(actionId);
  return { executedType: action.type };
}
