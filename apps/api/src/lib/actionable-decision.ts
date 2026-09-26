import { type Prisma } from "@allohq/database";
import { ActionStatus } from "@allohq/autonomy-engine";

/** A merchant can still act on a pending decision only until it expires. */
export function actionableDecisionWhere(storeId: string, now = new Date()): Prisma.ActionQueueWhereInput {
  return {
    storeId,
    status: ActionStatus.PENDING,
    OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
  };
}
