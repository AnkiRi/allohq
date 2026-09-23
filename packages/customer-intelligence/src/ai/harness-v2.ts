import {
  DEFAULT_MODEL,
  FALLBACK_CHAIN,
  getModel,
  resolveModelChain,
  type AIModelId,
  type AITask,
} from "./policy";
import { migrateHarnessRoutes } from "./harness-migration";
import {
  normalizeModelHarness,
  type ModelHarnessConfig,
  type ResolvedModelRoute,
} from "./model-harness";
import {
  MODEL_REGISTRY,
  TEXT_WORKLOADS,
  VISUAL_WORKLOADS,
  WORKLOAD_CAPABILITY,
  isModelAvailable,
  modelById,
  type HarnessWorkload,
  type ModelEntry,
  type TextWorkload,
} from "./model-registry";

/**
 * The workspace's saved model routing.
 *
 * Capability compatibility is enforced HERE, on the way in, not in the browser.
 * A form can be tampered with; this function is the only way a route reaches
 * the database. A route the registry says cannot work is dropped rather than
 * stored — a stored impossible route would look configured in settings and then
 * fail at the moment a merchant was waiting on it.
 */
export interface HarnessRouteV2 {
  primary: string;
  /** Ordered. Each must be capable of the same job as the primary. */
  fallbacks: string[];
  /**
   * Carried forward from v1, which allowed per-route generation defaults.
   * Settings does not expose these, but a workspace that set them keeps them —
   * a migration that quietly reset someone's tuning is the failure this shape
   * exists to avoid.
   */
  temperature?: number;
  maxTokens?: number;
}

export interface ModelHarnessV2 {
  version: 2;
  /** Applied to text workloads with no route of their own. */
  textDefault: HarnessRouteV2;
  routes: Partial<Record<HarnessWorkload, HarnessRouteV2>>;
}

/** Models that can do this job at all, whether or not they are configured. */
export function eligibleModels(workload: HarnessWorkload): ModelEntry[] {
  const capability = WORKLOAD_CAPABILITY[workload];
  return MODEL_REGISTRY.filter((model) => model.capabilities.includes(capability));
}

function canDo(modelId: string, workload: HarnessWorkload): boolean {
  const model = modelById(modelId);
  return !!model && model.capabilities.includes(WORKLOAD_CAPABILITY[workload]);
}

export const DEFAULT_TEXT_ROUTE: HarnessRouteV2 = {
  primary: DEFAULT_MODEL,
  fallbacks: [...(FALLBACK_CHAIN[DEFAULT_MODEL] ?? [])],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Keep only what this workload can actually run. Returns undefined when the
 * primary itself is impossible — an unroutable workload falls back to Joon's
 * own selection, which is always capability-correct.
 */
function normalizeRoute(value: unknown, workload: HarnessWorkload): HarnessRouteV2 | undefined {
  if (!isRecord(value)) return undefined;
  const primary = typeof value.primary === "string" ? value.primary : "";
  if (!canDo(primary, workload)) return undefined;

  const fallbacks = (Array.isArray(value.fallbacks) ? value.fallbacks : [])
    .filter((id): id is string => typeof id === "string")
    .filter((id) => id !== primary && canDo(id, workload));

  const temperature =
    typeof value.temperature === "number" &&
    Number.isFinite(value.temperature) &&
    value.temperature >= 0 &&
    value.temperature <= 2
      ? value.temperature
      : undefined;
  const maxTokens =
    typeof value.maxTokens === "number" &&
    Number.isInteger(value.maxTokens) &&
    value.maxTokens >= 128 &&
    value.maxTokens <= 32_768
      ? value.maxTokens
      : undefined;

  return {
    primary,
    fallbacks: [...new Set(fallbacks)],
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
  };
}

/**
 * Parse whatever is in the database — a v2 config, a v1 config from before the
 * workloads were split, or nothing at all — into today's shape.
 */
export function normalizeModelHarnessV2(value: unknown): ModelHarnessV2 {
  if (isRecord(value) && value.version !== 2) return fromV1(normalizeModelHarness(value));
  if (!isRecord(value)) return { version: 2, textDefault: { ...DEFAULT_TEXT_ROUTE }, routes: {} };

  const textDefault =
    normalizeRoute(value.textDefault, "strategy") ?? { ...DEFAULT_TEXT_ROUTE };

  const rawRoutes = isRecord(value.routes) ? value.routes : {};
  const routes: ModelHarnessV2["routes"] = {};
  for (const workload of [...TEXT_WORKLOADS, ...VISUAL_WORKLOADS]) {
    const route = normalizeRoute(rawRoutes[workload], workload);
    if (route) routes[workload] = route;
  }

  return { version: 2, textDefault, routes };
}

/** Carry a v1 harness forward without losing a route anyone configured. */
function fromV1(v1: ModelHarnessConfig): ModelHarnessV2 {
  const textDefault =
    normalizeRoute(v1.defaultRoute, "strategy") ?? { ...DEFAULT_TEXT_ROUTE };

  const routes: ModelHarnessV2["routes"] = {};
  // v1 only ever routed by workload in custom mode; unified mode meant "the
  // default everywhere", which textDefault already expresses.
  if (v1.mode === "custom") {
    const migrated = migrateHarnessRoutes(v1);
    for (const [workload, route] of Object.entries(migrated) as Array<[TextWorkload, HarnessRouteV2]>) {
      const normalized = normalizeRoute(route, workload);
      if (normalized) routes[workload] = normalized;
    }
  }

  return { version: 2, textDefault, routes };
}

/** The route a workload actually gets, and whether it is its own. */
export function routeForWorkload(
  harness: ModelHarnessV2,
  workload: HarnessWorkload,
): { route: HarnessRouteV2 | null; source: "workload" | "text_default" | "joon" } {
  const own = harness.routes[workload];
  if (own) return { route: own, source: "workload" };
  if (WORKLOAD_CAPABILITY[workload] === "text") {
    return { route: harness.textDefault, source: "text_default" };
  }
  // Visual work with no route: Joon's own tier ordering picks, which never
  // reaches a legacy model while a current one is configured.
  return { route: null, source: "joon" };
}

/**
 * What settings shows: every workload, what it will use, and whether that
 * choice can run right now. `configured` is computed on the server because it
 * depends on credentials the browser must never see.
 */
export function describeHarnessV2(harness: ModelHarnessV2): Array<{
  workload: HarnessWorkload;
  kind: "text" | "visual";
  primary: string | null;
  fallbacks: string[];
  source: "workload" | "text_default" | "joon";
  runnable: boolean;
}> {
  return [...TEXT_WORKLOADS, ...VISUAL_WORKLOADS].map((workload) => {
    const { route, source } = routeForWorkload(harness, workload);
    const candidates = route ? [route.primary, ...route.fallbacks] : eligibleModels(workload).map((m) => m.id);
    return {
      workload,
      kind: WORKLOAD_CAPABILITY[workload] === "text" ? "text" : "visual",
      primary: route?.primary ?? null,
      fallbacks: route?.fallbacks ?? [],
      source,
      runnable: candidates.some((id) => {
        const model = modelById(id);
        return !!model && isModelAvailable(model);
      }),
    };
  });
}

/**
 * Resolve the ordered models to attempt for one text job.
 *
 * The workspace's route comes first, then Joon's own policy chain, so a
 * configured choice is honoured but a provider outage still degrades instead of
 * failing. An explicit call-level model remains a deliberate one-off override
 * and wins over everything.
 *
 * This is what stops the settings screen being decorative: what a merchant
 * saves here is what the gateway attempts.
 */
export function resolveTextRoute(opts: {
  model?: AIModelId;
  task?: AITask;
  workload?: TextWorkload;
  harness?: unknown;
}): ResolvedModelRoute {
  if (opts.model && getModel(opts.model)) {
    return { workload: opts.workload, source: "explicit", candidates: resolveModelChain({ model: opts.model }) };
  }

  const policyTail = resolveModelChain({ task: opts.task });
  if (opts.harness === undefined) {
    return { workload: opts.workload, source: "system_policy", candidates: policyTail };
  }

  const harness = normalizeModelHarnessV2(opts.harness);
  const own = opts.workload ? harness.routes[opts.workload] : undefined;
  const route = own ?? harness.textDefault;

  return {
    workload: opts.workload,
    source: own ? "harness_workload" : "harness_default",
    candidates: [
      ...new Set([route.primary as AIModelId, ...(route.fallbacks as AIModelId[]), ...policyTail]),
    ],
    ...(route.temperature !== undefined ? { temperature: route.temperature } : {}),
    ...(route.maxTokens !== undefined ? { maxTokens: route.maxTokens } : {}),
  };
}
