import { prisma } from "@allohq/database";

export interface StoreGovernorConfig {
  maxEmailsPerWeek?: number;
  quietHours?: { startHour: number; endHour: number };
  timezone?: string;
  recentPurchase?: { standardHours: number; discountHours: number };
}

/**
 * Load a store's merchant-configured governor overrides (Phase 5) from the
 * Guardrail table + Store.timezone, so the send path honors what the merchant
 * actually set in onboarding instead of store-agnostic defaults. Spread the
 * result into `checkAllRules(...)`.
 */
export async function loadStoreGovernorConfig(storeId: string): Promise<StoreGovernorConfig> {
  const [rules, store] = await Promise.all([
    prisma.guardrail.findMany({ where: { storeId, isActive: true }, select: { ruleType: true, ruleValue: true } }),
    prisma.store.findUnique({ where: { id: storeId }, select: { timezone: true } }),
  ]);

  const out: StoreGovernorConfig = {};
  if (store?.timezone) out.timezone = store.timezone;
  for (const r of rules) {
    const v = r.ruleValue as Record<string, unknown> | null;
    if (r.ruleType === "max_sends_per_week" && typeof v?.["max"] === "number") {
      out.maxEmailsPerWeek = v["max"] as number;
    }
    if (r.ruleType === "quiet_hours" && typeof v?.["startHour"] === "number" && typeof v?.["endHour"] === "number") {
      out.quietHours = { startHour: v["startHour"] as number, endHour: v["endHour"] as number };
    }
    if (r.ruleType === "recent_purchase") {
      const standardHours = typeof v?.["standardHours"] === "number" ? v["standardHours"] as number : 72;
      const discountHours = typeof v?.["discountHours"] === "number" ? v["discountHours"] as number : 168;
      out.recentPurchase = { standardHours, discountHours };
    }
  }
  return out;
}
