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

/**
 * Lifetime generated-image spend ceiling for one campaign, in US dollars.
 *
 * The daily workspace budget stops a runaway loop but says nothing about one
 * campaign quietly consuming the whole day's allowance while a merchant
 * iterates on a hero image. A per-campaign ceiling keeps one email's
 * experimentation from starving every other email in the workspace.
 */
export const CAMPAIGN_IMAGE_BUDGET_USD = Number(process.env["IMAGE_CAMPAIGN_BUDGET_USD"] ?? 2);

export function campaignImageBudgetExceeded(
  spentUsd: number,
  budgetUsd: number = CAMPAIGN_IMAGE_BUDGET_USD,
): boolean {
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) return true;
  if (!Number.isFinite(spentUsd) || spentUsd < 0) return false;
  return spentUsd >= budgetUsd;
}

/**
 * Generated-image spend attributed to one email template, for its lifetime.
 *
 * Templates are the stable identity here: a campaign may be created, deleted
 * and recreated around the same email while a merchant iterates.
 */
export async function templateImageSpendUsd(templateId: string): Promise<number> {
  const spend = await prisma.generatedImage.aggregate({
    where: { templateId },
    _sum: { cost: true },
  });
  return spend._sum.cost ?? 0;
}

/** Both ceilings, checked together, with the reason the caller should show. */
export async function imageSpendRefusal(input: {
  workspaceId: string;
  templateId?: string;
  now?: Date;
}): Promise<string | null> {
  const daily = await dailyImageSpendUsd(input.workspaceId, input.now);
  if (imageBudgetExceeded(daily)) {
    return `This workspace has reached its daily image budget ($${DAILY_IMAGE_BUDGET_USD}). Generation resumes tomorrow, or an operator can raise IMAGE_DAILY_BUDGET_USD.`;
  }
  if (input.templateId) {
    const perCampaign = await templateImageSpendUsd(input.templateId);
    if (campaignImageBudgetExceeded(perCampaign)) {
      return `This email has reached its image budget ($${CAMPAIGN_IMAGE_BUDGET_USD}). Other emails in the workspace are unaffected.`;
    }
  }
  return null;
}
