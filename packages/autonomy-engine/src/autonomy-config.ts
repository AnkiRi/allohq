import { prisma } from "@allohq/database";
import {
  assertCapabilityAllowed,
  isCapabilityAllowed,
} from "@allohq/release-gate";
import {
  AutonomyTier,
  ActionCategory,
  DEFAULT_AUTONOMY_MATRIX,
  type AutonomyConfigData,
} from "./types";

/**
 * Get the autonomy tier for a given store and action category.
 * Falls back to the default autonomy matrix if not configured.
 */
export async function getAutonomyTier(
  storeId: string,
  category: ActionCategory,
): Promise<AutonomyTier> {
  const config = await prisma.autonomyConfig.findUnique({
    where: { storeId_category: { storeId, category } },
  });

  const tier = config
    ? (config.tier as AutonomyTier)
    : (DEFAULT_AUTONOMY_MATRIX[category] ?? AutonomyTier.COPILOT);

  // v1 release boundary: autopilot is out of scope. Coerced on READ (not just
  // on write) because stores configured before the boundary already carry
  // AUTOPILOT rows, and every execution path funnels through this function.
  if (tier === AutonomyTier.AUTOPILOT && !isCapabilityAllowed("autopilot")) {
    return AutonomyTier.COPILOT;
  }
  return tier;
}

/**
 * Set the autonomy tier for a given store and action category.
 */
/** Throws under the v1 boundary if AUTOPILOT is requested. */
export async function setAutonomyTier(
  storeId: string,
  category: ActionCategory,
  tier: AutonomyTier,
  settings?: { confidenceThreshold?: number },
): Promise<AutonomyConfigData> {
  if (tier === AutonomyTier.AUTOPILOT) {
    assertCapabilityAllowed("autopilot", `${storeId}/${category}`);
  }

  const config = await prisma.autonomyConfig.upsert({
    where: { storeId_category: { storeId, category } },
    create: {
      storeId,
      category,
      tier,
      settings: settings ?? {},
    },
    update: {
      tier,
      settings: settings ?? {},
    },
  });

  return {
    storeId: config.storeId,
    category: config.category as ActionCategory,
    tier: config.tier as AutonomyTier,
    settings: config.settings as AutonomyConfigData["settings"],
  };
}

/**
 * Get all autonomy configs for a store, filling in defaults for unconfigured categories.
 */
export async function getAllAutonomyConfigs(
  storeId: string,
): Promise<AutonomyConfigData[]> {
  const configs = await prisma.autonomyConfig.findMany({
    where: { storeId },
  });

  const configMap = new Map(configs.map((c) => [c.category, c]));
  const result: AutonomyConfigData[] = [];

  for (const category of Object.values(ActionCategory)) {
    const existing = configMap.get(category);
    result.push({
      storeId,
      category,
      tier: existing
        ? (existing.tier as AutonomyTier)
        : DEFAULT_AUTONOMY_MATRIX[category] ?? AutonomyTier.COPILOT,
      settings: existing ? (existing.settings as AutonomyConfigData["settings"]) : {},
    });
  }

  return result;
}

/**
 * Initialize default autonomy configs for a new store.
 */
export async function initializeDefaults(storeId: string): Promise<void> {
  const entries = Object.entries(DEFAULT_AUTONOMY_MATRIX);
  await prisma.autonomyConfig.createMany({
    data: entries.map(([category, tier]) => ({
      storeId,
      category,
      tier,
      settings: {},
    })),
    skipDuplicates: true,
  });
}
