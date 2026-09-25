import { AI_WORKLOADS, type AIWorkload, type ModelHarnessConfig, type ModelRoute } from "./model-harness";
import { TEXT_WORKLOADS, type TextWorkload } from "./model-registry";

/**
 * Carrying existing harness configuration forward.
 *
 * v1 had seven workloads. The expanded set splits `creative` into four jobs
 * that deserve different models — structure, short copy, long content, brand
 * refinement — and merges `support` and `orchestration` into one agent route.
 *
 * Renaming without migrating would silently drop every custom route a
 * workspace had set, because the v1 normaliser discards workloads it does not
 * recognise. Nobody should log in to find Joon quietly back on defaults.
 */

/** Where each v1 workload's route belongs now. */
const V1_TO_TEXT: Record<AIWorkload, TextWorkload[]> = {
  strategy: ["strategy"],
  // One creative route becomes four; all four inherit what was configured.
  creative: ["email_structure", "short_copy", "long_content", "brand_refinement"],
  analysis: ["analysis"],
  classification: ["classification"],
  evaluation: ["evaluation"],
  support: ["merchant_agent_orchestration"],
  orchestration: ["merchant_agent_orchestration"],
};

export type TextHarnessRoutes = Partial<Record<TextWorkload, ModelRoute>>;

/**
 * Expand a v1 harness into the current workload set.
 *
 * Every route a workspace had is preserved. Where two v1 workloads map to the
 * same new one, the first configured wins rather than the last — `support`
 * ahead of `orchestration` — so the result does not depend on key order.
 */
export function migrateHarnessRoutes(config: ModelHarnessConfig): TextHarnessRoutes {
  const migrated: TextHarnessRoutes = {};
  for (const workload of AI_WORKLOADS) {
    const route = config.routes[workload];
    if (!route) continue;
    for (const target of V1_TO_TEXT[workload]) {
      if (!migrated[target]) migrated[target] = { ...route, fallbacks: [...route.fallbacks] };
    }
  }
  return migrated;
}

/** Which current workloads a v1 workload became, for explaining the change. */
export function describeMigration(workload: AIWorkload): TextWorkload[] {
  return V1_TO_TEXT[workload];
}

/** True when every configured v1 route survived into the new shape. */
export function migrationPreservesRoutes(config: ModelHarnessConfig): boolean {
  const migrated = migrateHarnessRoutes(config);
  return AI_WORKLOADS.filter((workload) => config.routes[workload]).every((workload) =>
    V1_TO_TEXT[workload].some((target) => migrated[target] !== undefined),
  );
}

/** Text workloads that still have no explicit route and fall to the default. */
export function unroutedWorkloads(migrated: TextHarnessRoutes): TextWorkload[] {
  return TEXT_WORKLOADS.filter((workload) => migrated[workload] === undefined);
}
