import {
  DEFAULT_MODEL,
  FALLBACK_CHAIN,
  getModel,
  resolveModelChain,
  type AIModelId,
  type AITask,
} from "./policy";

/**
 * Stable product-level jobs that merchants can route independently.
 *
 * These are deliberately broader than individual prompts. A harness should not
 * need to change whenever a new email generator or analysis screen is added.
 */
export const AI_WORKLOADS = [
  "strategy",
  "creative",
  "analysis",
  "classification",
  "evaluation",
  "support",
  "orchestration",
] as const;

export type AIWorkload = (typeof AI_WORKLOADS)[number];
export type ModelHarnessMode = "unified" | "custom";

export interface ModelRoute {
  primary: AIModelId;
  fallbacks: AIModelId[];
  /** Optional per-route generation defaults. Call-level values still win. */
  temperature?: number;
  maxTokens?: number;
}

export interface ModelHarnessConfig {
  version: 1;
  mode: ModelHarnessMode;
  defaultRoute: ModelRoute;
  routes: Partial<Record<AIWorkload, ModelRoute>>;
}

export interface ResolvedModelRoute {
  workload?: AIWorkload;
  source: "explicit" | "harness_default" | "harness_workload" | "system_policy";
  candidates: AIModelId[];
  temperature?: number;
  maxTokens?: number;
}

export const DEFAULT_MODEL_HARNESS: ModelHarnessConfig = {
  version: 1,
  mode: "unified",
  defaultRoute: {
    primary: DEFAULT_MODEL,
    fallbacks: [...(FALLBACK_CHAIN[DEFAULT_MODEL] ?? [])],
  },
  routes: {},
};

const TASK_TO_WORKLOAD: Record<AITask, AIWorkload> = {
  reasoning: "strategy",
  generation: "creative",
  analysis: "analysis",
  classification: "classification",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKnownModel(value: unknown): value is AIModelId {
  return typeof value === "string" && !!getModel(value as AIModelId);
}

function normalizeRoute(value: unknown, fallback: ModelRoute): ModelRoute {
  if (!isRecord(value)) return { ...fallback, fallbacks: [...fallback.fallbacks] };

  const primary = isKnownModel(value.primary) ? value.primary : fallback.primary;
  const rawFallbacks = Array.isArray(value.fallbacks)
    ? value.fallbacks.filter(isKnownModel)
    : fallback.fallbacks;
  const fallbacks = [...new Set(rawFallbacks)].filter((id) => id !== primary);

  const temperature =
    typeof value.temperature === "number" &&
    Number.isFinite(value.temperature) &&
    value.temperature >= 0 &&
    value.temperature <= 2
      ? value.temperature
      : fallback.temperature;
  const maxTokens =
    typeof value.maxTokens === "number" &&
    Number.isInteger(value.maxTokens) &&
    value.maxTokens >= 128 &&
    value.maxTokens <= 32_768
      ? value.maxTokens
      : fallback.maxTokens;

  return {
    primary,
    fallbacks,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
  };
}

/**
 * Parse untrusted JSON from Prisma/API input into a safe, forward-compatible
 * harness. Unknown models and workloads are discarded instead of reaching an
 * SDK call.
 */
export function normalizeModelHarness(value: unknown): ModelHarnessConfig {
  if (!isRecord(value)) {
    return {
      ...DEFAULT_MODEL_HARNESS,
      defaultRoute: {
        ...DEFAULT_MODEL_HARNESS.defaultRoute,
        fallbacks: [...DEFAULT_MODEL_HARNESS.defaultRoute.fallbacks],
      },
      routes: {},
    };
  }

  const mode: ModelHarnessMode = value.mode === "custom" ? "custom" : "unified";
  const defaultRoute = normalizeRoute(
    value.defaultRoute,
    DEFAULT_MODEL_HARNESS.defaultRoute,
  );
  const rawRoutes = isRecord(value.routes) ? value.routes : {};
  const routes: Partial<Record<AIWorkload, ModelRoute>> = {};

  for (const workload of AI_WORKLOADS) {
    if (rawRoutes[workload] !== undefined) {
      routes[workload] = normalizeRoute(rawRoutes[workload], defaultRoute);
    }
  }

  return { version: 1, mode, defaultRoute, routes };
}

function dedupe(ids: AIModelId[]): AIModelId[] {
  return [...new Set(ids)];
}

/**
 * Resolve an ordered model chain. An explicit call-level model is an intentional
 * one-off override. Otherwise, custom workload routes win, followed by the
 * harness default, then the built-in safety chain.
 */
export function resolveHarnessRoute(opts: {
  model?: AIModelId;
  task?: AITask;
  workload?: AIWorkload;
  harness?: ModelHarnessConfig | unknown;
}): ResolvedModelRoute {
  if (opts.model && getModel(opts.model)) {
    return {
      workload: opts.workload ?? (opts.task ? TASK_TO_WORKLOAD[opts.task] : undefined),
      source: "explicit",
      candidates: resolveModelChain({ model: opts.model }),
    };
  }

  const workload = opts.workload ?? (opts.task ? TASK_TO_WORKLOAD[opts.task] : undefined);
  if (opts.harness !== undefined) {
    const harness = normalizeModelHarness(opts.harness);
    const workloadRoute =
      harness.mode === "custom" && workload ? harness.routes[workload] : undefined;
    const route = workloadRoute ?? harness.defaultRoute;
    const policyTail = resolveModelChain({ task: opts.task });

    return {
      workload,
      source: workloadRoute ? "harness_workload" : "harness_default",
      candidates: dedupe([route.primary, ...route.fallbacks, ...policyTail]),
      ...(route.temperature !== undefined ? { temperature: route.temperature } : {}),
      ...(route.maxTokens !== undefined ? { maxTokens: route.maxTokens } : {}),
    };
  }

  return {
    workload,
    source: "system_policy",
    candidates: resolveModelChain({ task: opts.task }),
  };
}

export function describeHarness(config: ModelHarnessConfig | unknown): Array<{
  workload: "default" | AIWorkload;
  primary: AIModelId;
  fallbacks: AIModelId[];
  inherited: boolean;
}> {
  const harness = normalizeModelHarness(config);
  const rows: Array<{
    workload: "default" | AIWorkload;
    primary: AIModelId;
    fallbacks: AIModelId[];
    inherited: boolean;
  }> = [
    {
      workload: "default",
      primary: harness.defaultRoute.primary,
      fallbacks: harness.defaultRoute.fallbacks,
      inherited: false,
    },
  ];

  for (const workload of AI_WORKLOADS) {
    const route =
      harness.mode === "custom" ? harness.routes[workload] : undefined;
    rows.push({
      workload,
      primary: route?.primary ?? harness.defaultRoute.primary,
      fallbacks: route?.fallbacks ?? harness.defaultRoute.fallbacks,
      inherited: !route,
    });
  }

  return rows;
}
