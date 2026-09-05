import { prisma } from "@allohq/database";
import { estimateChurnRisk } from "./churn-risk";
export interface ChurnSignals { daysSinceLastOrder: number | null; orderCount: number; totalSpend: number; avgOrderIntervalDays: number | null; }

/** Collect engagement signals, then delegate to the single canonical risk formula. */
export async function computeChurnRiskEstimate(customerId: string, _storeId: string, signals: ChurnSignals): Promise<number> {
  let emailOpenRate: number | null = null;
  let emailClickRate: number | null = null;
  let daysSinceLastBrowse: number | null = null;
  try {
    const [delivered, opened, clicked, browse] = await Promise.all([
      prisma.messageLog.count({ where: { customerId, channel: "email", status: { in: ["delivered", "opened", "clicked"] } } }),
      prisma.messageLog.count({ where: { customerId, channel: "email", openedAt: { not: null } } }),
      prisma.messageLog.count({ where: { customerId, channel: "email", clickedAt: { not: null } } }),
      prisma.storefrontEvent.findFirst({ where: { customerId }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true } }),
    ]);
    if (delivered >= 3) { emailOpenRate = opened / delivered; emailClickRate = clicked / delivered; }
    if (browse) daysSinceLastBrowse = (Date.now() - browse.occurredAt.getTime()) / 86_400_000;
  } catch { /* missing history stays neutral */ }
  return estimateChurnRisk({ ...signals, emailOpenRate, emailClickRate, daysSinceLastBrowse }).riskEstimate;
}

/** @deprecated Stored field retains its historic name; this is an uncalibrated risk estimate. */
export const computeChurnProbability = computeChurnRiskEstimate;
