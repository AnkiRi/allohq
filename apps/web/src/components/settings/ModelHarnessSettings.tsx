"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Check, ChevronDown, Cpu, RotateCcw } from "lucide-react";
import {
  ModelSelect,
  WorkloadRow,
  clone,
  EMPTY,
  CAPABILITY_COPY,
  type CatalogueModel,
  type CatalogueWorkload,
  type Harness,
  type Route,
} from "./ModelHarnessRow";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

export function ModelHarnessSettings() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: catalogue, isLoading: catalogueLoading } = (
    trpc.ai.harnessCatalogue as any
  ).useQuery() as {
    data: { models: CatalogueModel[]; workloads: CatalogueWorkload[] } | undefined;
    isLoading: boolean;
  };
  const { data: settings, isLoading: settingsLoading } = (trpc.ai.getSettings as any).useQuery() as {
    data: { modelHarness: Harness } | undefined;
    isLoading: boolean;
  };

  const [draft, setDraft] = useState<Harness>(EMPTY);
  const [saved, setSaved] = useState(JSON.stringify(EMPTY));
  const [showModels, setShowModels] = useState(false);

  useEffect(() => {
    if (!settings?.modelHarness) return;
    const next = clone(settings.modelHarness);
    setDraft(next);
    setSaved(JSON.stringify(next));
  }, [settings?.modelHarness]);

  const models = catalogue?.models ?? [];
  const workloads = catalogue?.workloads ?? [];
  const textWorkloads = workloads.filter((workload) => workload.kind === "text");
  const visualWorkloads = workloads.filter((workload) => workload.kind === "visual");
  const textModels = models.filter((model) => model.capabilities.includes("text"));
  const dirty = JSON.stringify(draft) !== saved;
  const loading = catalogueLoading || settingsLoading;

  const save = (trpc.ai.setModelHarness as any).useMutation({
    onSuccess: (result: { harness: Harness }) => {
      const next = clone(result.harness);
      setDraft(next);
      setSaved(JSON.stringify(next));
      (utils.ai as any).getSettings.invalidate();
      toast("Saved. New work uses these models.", "success");
    },
    onError: (error: { message?: string }) => {
      toast(error.message || "Couldn’t save.", "error");
    },
  }) as { mutate: (input: Harness) => void; isPending: boolean };

  function setRoute(workload: string, route: Route | undefined) {
    setDraft((current) => {
      const routes = { ...current.routes };
      if (route) routes[workload] = route;
      else delete routes[workload];
      return { ...current, routes };
    });
  }

  const defaultModel = models.find((model) => model.id === draft.textDefault.primary);

  return (
    <section className="glass-card-static overflow-hidden rounded-xl">
      <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <h2 className="section-header text-[13px]">Models</h2>
          </div>
          <p className="mt-2 max-w-[68ch] text-[11px] leading-relaxed text-muted-foreground">
            Joon picks a sensible model for every job on its own. Change one here
            only if you want to. Each job lists only models that can actually do
            it — writing models cannot make pictures, and image models cannot
            write.
          </p>
        </div>

        <button
          type="button"
          onClick={() => save.mutate(draft)}
          disabled={!dirty || save.isPending || loading}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-[11px] font-semibold text-primary-foreground transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {save.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
          {!dirty && !save.isPending && <Check className="h-3.5 w-3.5" />}
        </button>
      </div>

      {loading ? (
        <div className="space-y-2 p-5 sm:p-6">
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="glass-skeleton h-12 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="p-5 sm:p-6">
          <div className="border-b border-border pb-4">
            <div className="grid gap-3 md:grid-cols-[minmax(200px,1.1fr)_minmax(190px,1fr)_minmax(190px,1fr)] md:items-start">
              <div>
                <p className="text-[12px] font-semibold text-foreground">Writing and thinking</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                  Used for every writing job below that you leave alone.
                </p>
              </div>
              <div>
                <p className="mb-1.5 text-[10px] text-muted-foreground">Model</p>
                <ModelSelect
                  value={draft.textDefault.primary}
                  options={textModels}
                  placeholder="Joon decides"
                  label="Default writing model"
                  onChange={(value) =>
                    value &&
                    setDraft((current) => ({
                      ...current,
                      textDefault: {
                        primary: value,
                        fallbacks: current.textDefault.fallbacks.filter((id) => id !== value),
                      },
                    }))
                  }
                />
              </div>
              <div>
                <p className="mb-1.5 text-[10px] text-muted-foreground">If that one fails</p>
                <ModelSelect
                  value={draft.textDefault.fallbacks[0] ?? ""}
                  options={textModels.filter((model) => model.id !== draft.textDefault.primary)}
                  placeholder="Nothing — let Joon decide"
                  label="Default writing fallback"
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      textDefault: { ...current.textDefault, fallbacks: value ? [value] : [] },
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="divide-y divide-border border-b border-border">
            {textWorkloads.map((workload) => (
              <WorkloadRow
                key={workload.id}
                workload={workload}
                route={draft.routes[workload.id]}
                models={models}
                inheritLabel={
                  defaultModel ? `Same as above — ${defaultModel.label}` : "Same as above"
                }
                onChange={(route) => setRoute(workload.id, route)}
              />
            ))}
          </div>

          <div className="border-b border-border py-4">
            <p className="text-[12px] font-semibold text-foreground">Images</p>
            <p className="mt-0.5 max-w-[64ch] text-[10px] leading-relaxed text-muted-foreground">
              Different work needs different models. Putting your real product
              in a scene requires one that can take your photograph as input, so
              only those are offered for that job.
            </p>
          </div>

          <div className="divide-y divide-border border-b border-border">
            {visualWorkloads.map((workload) => (
              <WorkloadRow
                key={workload.id}
                workload={workload}
                route={draft.routes[workload.id]}
                models={models}
                inheritLabel="Joon decides"
                onChange={(route) => setRoute(workload.id, route)}
              />
            ))}
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={() => setShowModels((open) => !open)}
              className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              aria-expanded={showModels}
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showModels ? "rotate-180" : ""}`}
              />
              {showModels ? "Hide" : "Show"} the {models.length} models Joon can run
            </button>

            {showModels && (
              <ul className="mt-3 space-y-2">
                {models.map((model) => (
                  <li key={model.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px]">
                    <span className="font-semibold text-foreground">{model.label}</span>
                    <span className="text-muted-foreground">{model.provider}</span>
                    <code className="font-mono text-[9px] text-muted-foreground">
                      {model.apiModelId}
                    </code>
                    <span className="text-muted-foreground">
                      {model.capabilities
                        .map((capability) => CAPABILITY_COPY[capability] ?? capability)
                        .join(", ")}
                    </span>
                    <span className={model.configured ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground"}>
                      {model.configured ? "configured" : "not configured"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {dirty && (
            <button
              type="button"
              onClick={() => setDraft(clone(JSON.parse(saved) as Harness))}
              className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Discard changes
            </button>
          )}
        </div>
      )}
    </section>
  );
}
