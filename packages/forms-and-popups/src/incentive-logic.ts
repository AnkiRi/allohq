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

  const selected = config.mode === "spin"
    ? chooseWeightedOutcome(config.spinOutcomes ?? [])
    : { label: `${config.discountValue ?? 10}${config.discountType === "fixed_amount" ? " off" : "% off"}`, discountType: config.discountType, discountValue: config.discountValue };
  const selectedType = selected.discountType ?? "percentage";
  const selectedValue = selected.discountValue ?? 0;

  if (identity) {
    const existing = await prisma.formIncentiveGrant.findUnique({ where: { formId_customerId: identity } });
    if (existing) return { code: existing.code, type: existing.kind, label: existing.label, repeated: true };
    try {
      await prisma.formIncentiveGrant.create({ data: { ...identity, kind: selectedValue > 0 ? "discount" : "no_prize", label: selected.label, value: selectedValue } });
    } catch {
      const winner = await prisma.formIncentiveGrant.findUnique({ where: { formId_customerId: identity } });
      if (winner) return { code: winner.code, type: winner.kind, label: winner.label, repeated: true };
      throw new Error("Could not reserve incentive grant");
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
  const code = config.code ?? generateCode(config.mode === "spin" ? "SPIN" : "JOON");

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
    if (identity) await prisma.formIncentiveGrant.deleteMany({ where: { ...identity, status: "pending" } });
    throw error;
  }

  if (identity) await prisma.formIncentiveGrant.update({ where: { formId_customerId: identity }, data: { code, status: "issued", issuedAt: new Date() } });
  return { code, type: config.type, label: selected.label, repeated: false };
}
