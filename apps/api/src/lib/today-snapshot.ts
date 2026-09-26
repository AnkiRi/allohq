import type { PrismaClient } from "@allohq/database";
import { actionableDecisionWhere } from "./actionable-decision";

/** One store and one clock for every count shown in Today's opening view. */
export async function loadTodaySnapshot(db: PrismaClient, storeId: string, asOf = new Date()) {
  const last24h = new Date(asOf.getTime() - 24 * 60 * 60 * 1000);
  const last30d = new Date(asOf.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [customers, stateProfiles, stateChanges24h, actionsPrepared24h, decisionsWaiting, attributed30d] = await Promise.all([
    db.customer.count({ where: { storeId } }),
    db.customerState.count({ where: { storeId } }),
    db.customerStateTransition.count({ where: { storeId, occurredAt: { gte: last24h, lte: asOf } } }),
    db.actionQueue.count({ where: { storeId, createdAt: { gte: last24h, lte: asOf } } }),
    db.actionQueue.count({ where: actionableDecisionWhere(storeId, asOf) }),
    db.orderAttribution.aggregate({
      where: { storeId, attributedAt: { gte: last30d, lte: asOf } },
      _sum: { revenue: true },
    }),
  ]);
  return {
    storeId,
    asOf,
    windows: { last24h, last30d },
    customers,
    stateProfiles,
    stateChanges24h,
    actionsPrepared24h,
    decisionsWaiting,
    attributedRevenue30d: Math.round((attributed30d._sum.revenue ?? 0) * 100) / 100,
  };
}
