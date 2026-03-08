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
