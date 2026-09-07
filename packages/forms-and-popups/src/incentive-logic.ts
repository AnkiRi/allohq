import { prisma } from "@allohq/database";
import { shopify } from "@allohq/ecommerce-integrations";
import type { IncentiveConfig } from "./types";
import { randomBytes, randomInt } from "node:crypto";

/**
 * Generate a unique discount code.
 */
function generateCode(prefix: string = "ALLO"): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < bytes.length; i++) code += chars[bytes[i]! % chars.length];
  return `${prefix}-${code}`;
}

export function incentiveGrantIsClaimable(status: string, updatedAt: Date, now = new Date()): boolean {
  return status === "failed" || status === "pending" || (status === "processing" && updatedAt.getTime() < now.getTime() - 5 * 60_000);
}

export function chooseWeightedOutcome(outcomes: NonNullable<IncentiveConfig["spinOutcomes"]>, draw?: number) {
  if (outcomes.length < 2 || outcomes.length > 12) throw new Error("Spin-to-win requires 2–12 outcomes");
  const weights = outcomes.map((outcome) => Math.floor(outcome.weight));
  if (weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) throw new Error("Every spin outcome needs a positive integer weight");
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total > 1_000_000) throw new Error("Spin weights are too large");
  let cursor = draw === undefined ? randomInt(total) : Math.max(0, Math.min(total - 1, Math.floor(draw)));
  for (let index = 0; index < outcomes.length; index++) {
    cursor -= weights[index]!;
    if (cursor < 0) return outcomes[index]!;
  }
  return outcomes[outcomes.length - 1]!;
}

/**
 * Create an incentive discount code via Shopify and return the code.
 * Called when a form with incentive config receives a submission.
 */
export async function deliverIncentive(
  storeId: string,
  config: IncentiveConfig,
  identity?: { formId: string; customerId: string },
): Promise<{ code: string | null; type: string; label: string; repeated: boolean } | null> {
  if (!config || (config.mode !== "spin" && !config.discountType && config.type !== "freeShipping")) {
    return null;
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true },
  });

  if (!store) return null;

  if (config.type === "freeShipping") {
    throw new Error("Free-shipping signup incentives are not supported yet");
  }

  let selected = config.mode === "spin"
    ? chooseWeightedOutcome(config.spinOutcomes ?? [])
    : { label: `${config.discountValue ?? 10}${config.discountType === "fixed_amount" ? " off" : "% off"}`, discountType: config.discountType, discountValue: config.discountValue };
  let selectedType = selected.discountType ?? "percentage";
  let selectedValue = selected.discountValue ?? 0;

  if (identity) {
    const existing = await prisma.formIncentiveGrant.findUnique({ where: { formId_customerId: identity } });
    if (existing?.status === "issued" || existing?.status === "redeemed") return { code: existing.code, type: existing.kind, label: existing.label, repeated: true };
    if (existing) {
      selected = { label: existing.label, discountType: (existing.discountType as "percentage" | "fixed_amount" | null) ?? undefined, discountValue: existing.value ?? 0 };
      selectedType = selected.discountType ?? "percentage";
      selectedValue = selected.discountValue ?? 0;
      const staleBefore = new Date(Date.now() - 5 * 60_000);
      const claimed = await prisma.formIncentiveGrant.updateMany({
        where: { ...identity, OR: [{ status: "failed" }, { status: "pending" }, { status: "processing", updatedAt: { lt: staleBefore } }] },
        data: { status: "processing", attemptCount: { increment: 1 }, lastError: null },
      });
      if (claimed.count !== 1) return { code: existing.code, type: existing.kind, label: existing.label, repeated: true };
    } else {
      try {
        await prisma.formIncentiveGrant.create({ data: { ...identity, kind: selectedValue > 0 ? "discount" : "no_prize", discountType: selectedType, label: selected.label, value: selectedValue, status: "processing", attemptCount: 1 } });
      } catch {
        const winner = await prisma.formIncentiveGrant.findUnique({ where: { formId_customerId: identity } });
        if (winner) return { code: winner.code, type: winner.kind, label: winner.label, repeated: true };
        throw new Error("Could not reserve incentive grant");
      }
    }
  }

  if (selectedValue <= 0) {
    if (identity) await prisma.formIncentiveGrant.update({ where: { formId_customerId: identity }, data: { status: "issued", issuedAt: new Date() } });
    return { code: null, type: "no_prize", label: selected.label, repeated: false };
  }

  if (selectedType === "percentage") {
    const cap = await prisma.guardrail.findFirst({
      where: { storeId, ruleType: "max_discount", isActive: true },
      orderBy: { createdAt: "desc" },
      select: { ruleValue: true },
    });
    const maximum = (cap?.ruleValue as { maxPercent?: number } | null)?.maxPercent;
    if (typeof maximum === "number" && selectedValue > maximum) {
      if (identity) await prisma.formIncentiveGrant.delete({ where: { formId_customerId: identity } });
      throw new Error(`Signup incentive exceeds the merchant's ${maximum}% discount guardrail`);
    }
  }

  const client = await shopify.getShopifyAdminClient(store.id);
  // Even a merchant-provided base becomes a prefix: every customer receives a
  // unique code, preserving Shopify once-per-customer semantics and our ledger.
  const code = generateCode((config.code ?? (config.mode === "spin" ? "SPIN" : "JOON")).slice(0, 20));

  // Percentage or fixed discount
  try {
    await shopify.createDiscount(client, {
      code,
      valueType: selectedType,
      value: selectedValue,
      title: `Joon Signup - ${code}`,
      oncePerCustomer: true,
    });
  } catch (error) {
    if (identity) await prisma.formIncentiveGrant.updateMany({ where: identity, data: { status: "failed", lastError: error instanceof Error ? error.message.slice(0, 500) : "Discount provider failure" } });
    throw error;
  }

  if (identity) await prisma.formIncentiveGrant.update({ where: { formId_customerId: identity }, data: { code, status: "issued", issuedAt: new Date() } });
  return { code, type: config.type, label: selected.label, repeated: false };
}
