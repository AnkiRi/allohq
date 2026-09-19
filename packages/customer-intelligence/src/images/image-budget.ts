import { prisma } from "@allohq/database";

/**
 * Daily generated-image spend ceiling per workspace, in US dollars.
 *
 * Image generation recorded a per-call cost and logged it, but nothing capped
 * spend, rate or volume, so a loop or an enthusiastic merchant could run an
 * unbounded bill against Joon's own providers. Configurable because the right
 * number is an operational decision, not a product truth.
 */
export const DAILY_IMAGE_BUDGET_USD = Number(process.env["IMAGE_DAILY_BUDGET_USD"] ?? 5);

/**
 * Pure budget policy. A missing or nonsensical budget fails closed to stock
 * imagery rather than opening the tap.
 */
export function imageBudgetExceeded(
  spentUsd: number,
  budgetUsd: number = DAILY_IMAGE_BUDGET_USD
): boolean {
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) return true;
  if (!Number.isFinite(spentUsd) || spentUsd < 0) return false;
  return spentUsd >= budgetUsd;
}

/** Generated-image spend for a workspace over the trailing 24 hours. */
export async function dailyImageSpendUsd(workspaceId: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const spend = await prisma.generatedImage.aggregate({
    where: { workspaceId, createdAt: { gte: since } },
    _sum: { cost: true },
  });
  return spend._sum.cost ?? 0;
}
