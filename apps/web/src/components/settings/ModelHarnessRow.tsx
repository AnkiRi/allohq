"use client";

import * as React from "react";
import { useMemo } from "react";

/**
 * The presentation of one routing row, kept apart from the container that
 * fetches and saves.
 *
 * This split is not only tidiness: the container imports `@/lib/trpc`, and the
 * repo's unit runner executes every test from `apps/api`, where that alias
 * does not resolve. A test of the container therefore cannot load at all —
 * which is how a green local run hid a red CI one.
 */
type Kind = "text" | "visual";

export type CatalogueModel = {
  id: string;
  label: string;
  provider: string;
  apiModelId: string;
  capabilities: string[];
  costClass: "economy" | "standard" | "premium";
  tier: string;
  configured: boolean;
  note: string | null;
};

export type CatalogueWorkload = {
  id: string;
  kind: Kind;
  label: string;
  purpose: string;
  capability: string;
  /**
   * Decided on the server. The browser renders exactly this list and never
   * filters by capability itself, so there is no second copy of the rule to
   * drift out of step.
   */
  eligibleModelIds: string[];
};

export type Route = { primary: string; fallbacks: string[] };
export type Harness = {
  version: 2;
  textDefault: Route;
  routes: Partial<Record<string, Route>>;
};

export const EMPTY: Harness = {
  version: 2,
  textDefault: { primary: "claude-sonnet-5", fallbacks: [] },
  routes: {},
};

export const CAPABILITY_COPY: Record<string, string> = {
  text: "Writing and reasoning",
  image_generation: "Makes images",
  image_reference_input: "Takes your photo as input",
  image_analysis: "Reads images",
};

export function clone(harness: Harness): Harness {
  return {
    ...harness,
    textDefault: { ...harness.textDefault, fallbacks: [...harness.textDefault.fallbacks] },
    routes: Object.fromEntries(
      Object.entries(harness.routes).map(([key, route]) => [
        key,
        route ? { ...route, fallbacks: [...route.fallbacks] } : route,
      ]),
    ),
  };
}

export function ModelSelect({
  value,
  options,
  placeholder,
  label,
  onChange,
}: {
  value: string;
  options: CatalogueModel[];
  placeholder: string;
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[11px] text-foreground outline-none transition-colors hover:border-primary/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        <option value="">{placeholder}</option>
        {options.map((model) => (
          // An unreachable model stays visible but unselectable, and says why.
          // Hiding it would leave a merchant wondering where a model went.
          <option key={model.id} value={model.id} disabled={!model.configured}>
            {model.label} · {model.provider}
            {model.configured ? "" : " · not configured"}
          </option>
        ))}
      </select>
    </label>
  );
}

export function WorkloadRow({
  workload,
  route,
  models,
  inheritLabel,
  onChange,
}: {
  workload: CatalogueWorkload;
  route: Route | undefined;
  models: CatalogueModel[];
  inheritLabel: string;
  onChange: (route: Route | undefined) => void;
}) {
  const eligible = useMemo(
    () => models.filter((model) => workload.eligibleModelIds.includes(model.id)),
    [models, workload.eligibleModelIds],
  );
  const fallbackOptions = eligible.filter((model) => model.id !== route?.primary);
  // Two different situations that must not be reported as one. "Not
  // configured" invites the merchant to go and add a key; for a job Joon has
  // no adapter for, a key would change nothing.
  const unimplemented = workload.eligibleModelIds.length === 0;
  const runnable = eligible.some((model) => model.configured);

  return (
    <div className="grid gap-3 py-4 md:grid-cols-[minmax(200px,1.1fr)_minmax(190px,1fr)_minmax(190px,1fr)] md:items-start">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-foreground">{workload.label}</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
          {workload.purpose}
        </p>
        {unimplemented ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Joon cannot do this yet — no model it can run offers it.
          </p>
        ) : !runnable ? (
          <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-500">
            No model for this job is configured yet.
          </p>
        ) : null}
      </div>

      <div>
        <p className="mb-1.5 text-[10px] text-muted-foreground">Model</p>
        <ModelSelect
          value={route?.primary ?? ""}
          options={eligible}
          placeholder={inheritLabel}
          label={`${workload.label} model`}
          onChange={(value) =>
            onChange(
              value
                ? { primary: value, fallbacks: (route?.fallbacks ?? []).filter((id) => id !== value) }
                : undefined,
            )
          }
        />
      </div>

      <div className={route ? "" : "opacity-50"}>
        <p className="mb-1.5 text-[10px] text-muted-foreground">If that one fails</p>
        <ModelSelect
          value={route?.fallbacks[0] ?? ""}
          options={fallbackOptions}
          placeholder="Nothing — let Joon decide"
          label={`${workload.label} fallback model`}
          onChange={(value) =>
            route && onChange({ ...route, fallbacks: value ? [value] : [] })
          }
        />
      </div>
    </div>
  );
}

