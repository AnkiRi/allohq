"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Cpu, GitBranch, RotateCcw, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

type ModelId =
  | "claude-sonnet-5"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001"
  | "gpt-4o-mini";

type Workload =
  | "strategy"
  | "creative"
  | "analysis"
  | "classification"
  | "evaluation"
  | "support"
  | "orchestration";

type ModelRoute = {
  primary: ModelId;
  fallbacks: ModelId[];
  temperature?: number;
  maxTokens?: number;
};

type ModelHarness = {
  version: 1;
  mode: "unified" | "custom";
  defaultRoute: ModelRoute;
  routes: Partial<Record<Workload, ModelRoute>>;
};

type ModelOption = {
  id: ModelId;
  provider: string;
  label: string;
  description: string;
  tier: string;
  available: boolean;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
};

const WORKLOADS: Array<{
  id: Workload;
  label: string;
  description: string;
}> = [
  {
    id: "strategy",
    label: "Strategy",
    description: "Campaign direction, offers and retention decisions",
  },
  {
    id: "creative",
    label: "Creative",
    description: "Email, SMS, WhatsApp and campaign copy",
  },
  {
    id: "analysis",
    label: "Analysis",
    description: "Brand, customer and performance synthesis",
  },
  {
    id: "classification",
    label: "Classification",
    description: "Intent parsing, labels and structured extraction",
  },
  {
    id: "evaluation",
    label: "Evaluation",
    description: "Quality review and policy checks",
  },
  {
    id: "support",
    label: "Customer support",
    description: "Storefront customer conversations",
  },
  {
    id: "orchestration",
    label: "Joon operator",
    description: "Merchant chat and tool-using workflows",
  },
];

const EMPTY_HARNESS: ModelHarness = {
  version: 1,
  mode: "unified",
  defaultRoute: {
    primary: "claude-sonnet-5",
    fallbacks: ["claude-sonnet-4-6"],
  },
  routes: {},
};

function cloneHarness(harness: ModelHarness): ModelHarness {
  return {
    ...harness,
    defaultRoute: {
      ...harness.defaultRoute,
      fallbacks: [...harness.defaultRoute.fallbacks],
    },
    routes: Object.fromEntries(
      Object.entries(harness.routes).map(([key, route]) => [
        key,
        route
          ? { ...route, fallbacks: [...route.fallbacks] }
          : route,
      ]),
    ) as ModelHarness["routes"],
  };
}

function routeFor(harness: ModelHarness, workload: Workload): ModelRoute {
  return harness.routes[workload] ?? harness.defaultRoute;
}

function ModelSelect({
  value,
  models,
  onChange,
  label,
}: {
  value: ModelId | "";
  models: ModelOption[];
  onChange: (value: ModelId | "") => void;
  label: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as ModelId | "")}
        className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[11px] text-foreground outline-none transition-colors hover:border-primary/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        {value === "" && <option value="">No fallback</option>}
        {models.map((model) => (
          <option
            key={model.id}
            value={model.id}
            disabled={!model.available}
          >
            {model.label} · {model.provider}
            {!model.available ? " · unavailable" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ModelHarnessSettings() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: modelsData, isLoading: modelsLoading } = trpc.ai.models.useQuery();
  const { data: settings, isLoading: settingsLoading } =
    (trpc.ai.getSettings as any).useQuery() as {
      data:
        | {
            defaultModel: string | null;
            modelHarness: ModelHarness;
          }
        | undefined;
      isLoading: boolean;
    };

  const models = (modelsData ?? []) as ModelOption[];
  const [draft, setDraft] = useState<ModelHarness>(EMPTY_HARNESS);
  const [savedSnapshot, setSavedSnapshot] = useState(
    JSON.stringify(EMPTY_HARNESS),
  );

  useEffect(() => {
    if (!settings?.modelHarness) return;
    const next = cloneHarness(settings.modelHarness);
    setDraft(next);
    setSavedSnapshot(JSON.stringify(next));
  }, [settings?.modelHarness]);

  const dirty = JSON.stringify(draft) !== savedSnapshot;
  const selectedDefault = models.find(
    (model) => model.id === draft.defaultRoute.primary,
  );

  const saveHarness = (trpc.ai.setModelHarness as any).useMutation({
    onSuccess: (result: { harness: ModelHarness }) => {
      const next = cloneHarness(result.harness);
      setDraft(next);
      setSavedSnapshot(JSON.stringify(next));
      (utils.ai as any).getSettings.invalidate();
      toast("Model harness saved. New AI work will use these routes.", "success");
    },
    onError: (error: { message?: string }) => {
      toast(error.message || "Couldn’t save the model harness.", "error");
    },
  }) as {
    mutate: (input: ModelHarness) => void;
    isPending: boolean;
  };

  const routeSummary = useMemo(
    () =>
      WORKLOADS.reduce<Record<string, number>>((acc, workload) => {
        const model = routeFor(draft, workload.id).primary;
        acc[model] = (acc[model] ?? 0) + 1;
        return acc;
      }, {}),
    [draft],
  );

  function setDefaultPrimary(primary: ModelId) {
    setDraft((current) => ({
      ...current,
      defaultRoute: {
        ...current.defaultRoute,
        primary,
        fallbacks: current.defaultRoute.fallbacks.filter(
          (model) => model !== primary,
        ),
      },
    }));
  }

  function setDefaultFallback(fallback: ModelId | "") {
    setDraft((current) => ({
      ...current,
      defaultRoute: {
        ...current.defaultRoute,
        fallbacks:
          fallback && fallback !== current.defaultRoute.primary
            ? [fallback]
            : [],
      },
    }));
  }

  function toggleOverride(workload: Workload, enabled: boolean) {
    setDraft((current) => {
      const routes = { ...current.routes };
      if (enabled) {
        routes[workload] = {
          ...current.defaultRoute,
          fallbacks: [...current.defaultRoute.fallbacks],
        };
      } else {
        delete routes[workload];
      }
      return { ...current, routes };
    });
  }

  function updateRoute(
    workload: Workload,
    field: "primary" | "fallback",
    value: ModelId | "",
  ) {
    setDraft((current) => {
      const existing = current.routes[workload] ?? current.defaultRoute;
      const next: ModelRoute = {
        ...existing,
        fallbacks: [...existing.fallbacks],
      };

      if (field === "primary" && value) {
        next.primary = value;
        next.fallbacks = next.fallbacks.filter((model) => model !== value);
      }
      if (field === "fallback") {
        next.fallbacks =
          value && value !== next.primary ? [value] : [];
      }

      return {
        ...current,
        routes: { ...current.routes, [workload]: next },
      };
    });
  }

  const loading = modelsLoading || settingsLoading;

  return (
    <section className="glass-card-static rounded-xl overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <h2 className="section-header text-[13px]">Model harness</h2>
          </div>
          <p className="mt-2 max-w-[68ch] text-[11px] leading-relaxed text-muted-foreground">
            Use one dependable model across Joon, or route each kind of work to
            the model that fits it. A fallback keeps work moving when a provider
            is unavailable.
          </p>
        </div>

        <button
          type="button"
          onClick={() => saveHarness.mutate(draft)}
          disabled={!dirty || saveHarness.isPending || loading}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-[11px] font-semibold text-primary-foreground transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saveHarness.isPending ? "Saving…" : dirty ? "Save harness" : "Saved"}
          {!dirty && !saveHarness.isPending && <Check className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="p-5 sm:p-6">
        <div
          className="inline-flex rounded-lg border border-border bg-muted p-1"
          role="group"
          aria-label="Model routing mode"
        >
          {[
            {
              id: "unified" as const,
              label: "One model",
              icon: Sparkles,
            },
            {
              id: "custom" as const,
              label: "Route by job",
              icon: GitBranch,
            },
          ].map((mode) => {
            const Icon = mode.icon;
            const active = draft.mode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() =>
                  setDraft((current) => ({ ...current, mode: mode.id }))
                }
                className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-pressed={active}
              >
                <Icon className="h-3.5 w-3.5" />
                {mode.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="mt-6 space-y-2">
            {[1, 2, 3].map((row) => (
              <div key={row} className="h-12 rounded-lg glass-skeleton" />
            ))}
          </div>
        ) : (
          <>
            <div className="mt-6 border-y border-border">
              <div className="grid gap-3 py-4 md:grid-cols-[minmax(190px,1fr)_minmax(210px,1.2fr)_minmax(210px,1.2fr)] md:items-center">
                <div>
                  <p className="text-[12px] font-semibold text-foreground">
                    Default route
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Used everywhere unless a job has its own route
                  </p>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] text-muted-foreground">
                    Primary
                  </p>
                  <ModelSelect
                    value={draft.defaultRoute.primary}
                    models={models}
                    onChange={(value) => value && setDefaultPrimary(value)}
                    label="Default primary model"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] text-muted-foreground">
                    Fallback
                  </p>
                  <ModelSelect
                    value={draft.defaultRoute.fallbacks[0] ?? ""}
                    models={models.filter(
                      (model) => model.id !== draft.defaultRoute.primary,
                    )}
                    onChange={setDefaultFallback}
                    label="Default fallback model"
                  />
                </div>
              </div>
            </div>

            {draft.mode === "custom" && (
              <div className="divide-y divide-border border-b border-border">
                {WORKLOADS.map((workload) => {
                  const overridden = !!draft.routes[workload.id];
                  const route = routeFor(draft, workload.id);
                  return (
                    <div
                      key={workload.id}
                      className="grid gap-3 py-4 md:grid-cols-[minmax(190px,1fr)_minmax(210px,1.2fr)_minmax(210px,1.2fr)] md:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[11px] font-semibold text-foreground">
                            {workload.label}
                          </p>
                          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[9px] text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={overridden}
                              onChange={(event) =>
                                toggleOverride(
                                  workload.id,
                                  event.target.checked,
                                )
                              }
                              className="h-3.5 w-3.5 rounded border-border accent-[hsl(var(--primary))]"
                            />
                            Custom
                          </label>
                        </div>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                          {workload.description}
                        </p>
                      </div>

                      <div className={overridden ? "" : "opacity-55"}>
                        <p className="mb-1.5 text-[10px] text-muted-foreground">
                          Primary
                        </p>
                        <ModelSelect
                          value={route.primary}
                          models={models}
                          onChange={(value) =>
                            updateRoute(workload.id, "primary", value)
                          }
                          label={`${workload.label} primary model`}
                        />
                      </div>

                      <div className={overridden ? "" : "opacity-55"}>
                        <p className="mb-1.5 text-[10px] text-muted-foreground">
                          Fallback
                        </p>
                        <ModelSelect
                          value={route.fallbacks[0] ?? ""}
                          models={models.filter(
                            (model) => model.id !== route.primary,
                          )}
                          onChange={(value) =>
                            updateRoute(workload.id, "fallback", value)
                          }
                          label={`${workload.label} fallback model`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>
                {draft.mode === "unified"
                  ? `${selectedDefault?.label ?? draft.defaultRoute.primary} will handle every AI job.`
                  : `${Object.keys(draft.routes).length} custom route${Object.keys(draft.routes).length === 1 ? "" : "s"}; the rest inherit the default.`}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {Object.entries(routeSummary).map(([model, count]) => (
                  <span key={model}>
                    {models.find((item) => item.id === model)?.label ?? model}:{" "}
                    {count} jobs
                  </span>
                ))}
              </div>
            </div>

            {dirty && (
              <button
                type="button"
                onClick={() => {
                  const restored = JSON.parse(savedSnapshot) as ModelHarness;
                  setDraft(cloneHarness(restored));
                }}
                className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <RotateCcw className="h-3 w-3" />
                Discard changes
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
