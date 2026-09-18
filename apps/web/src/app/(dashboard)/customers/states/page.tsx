"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAlloAI } from "@/components/ai/AlloAIPanel";
import { CustomerWorkspaceNav } from "@/components/customers/CustomerWorkspaceNav";
import { MetricStrip, PageHeader } from "@/components/ui/AppPrimitives";

const LIFECYCLE = [
  "visitor",
  "champion",
  "loyal",
  "repeat",
  "first_buyer",
  "subscriber",
  "at_risk",
  "lost",
];
const CYCLES = ["early", "approaching", "due", "overdue", "unknown"];
const DISCOUNTS = [
  "full_price_likely",
  "discount_responsive",
  "discount_habituated",
  "inconclusive",
];

type StateOverview = {
  total: number;
  lifecycle: Array<{ key: string; count: number }>;
  cycle: Array<{ key: string; count: number }>;
  discounts: Array<{ key: string; count: number }>;
  queue: {
    due: number;
    failed: number;
    oldestDueAt: Date | string | null;
    updatedLastHour: number;
  };
  transitions: Array<{
    dimension: string;
    fromValue: string | null;
    toValue: string;
    count: number;
    lastOccurredAt: Date | string | null;
  }>;
};

type ExplorerState = {
  id: string;
  lifecycleStage: string;
  purchaseCyclePosition: string;
  discountBehavior: string;
  consentState: string;
  deliveryHealth: string;
  medianOrderIntervalDays: number | null;
  reorderConfidence: number;
  nextEvaluationAt: Date | string | null;
  customer: { id: string; firstName: string | null; lastName: string | null; email: string };
};

type StateExplorer = {
  states: ExplorerState[];
  total: number;
  page: number;
  pages: number;
};

function words(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "unknown";
}

function customerName(customer: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email;
}

function formatDate(value: Date | string | null) {
  if (!value) return "when new evidence arrives";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Distribution({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; count: number }>;
}) {
  const sorted = [...rows].sort((a, b) => b.count - a.count).slice(0, 5);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-[12px] font-medium text-foreground">{title}</h2>
      <div className="mt-3 space-y-2.5">
        {sorted.map((row) => (
          <div key={row.key}>
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="capitalize text-muted-foreground">{words(row.key)}</span>
              <span className="font-mono tabular-nums text-foreground">
                {row.count.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[hsl(var(--accent))]"
                style={{ width: `${total ? Math.max(2, (row.count / total) * 100) : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CustomerStatesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [lifecycle, setLifecycle] = useState("");
  const [cycle, setCycle] = useState("");
  const [discount, setDiscount] = useState("");
  const { submit: submitToJoon } = useAlloAI();
  const overview = (trpc.customers.stateOverview as any).useQuery() as {
    data?: StateOverview;
    isLoading: boolean;
  };
  const explorer = (trpc.customers.stateExplorer as any).useQuery({
    page,
    limit: 25,
    search: search || undefined,
    lifecycle: lifecycle || undefined,
    cycle: cycle || undefined,
    discount: discount || undefined,
  }) as { data?: StateExplorer; isLoading: boolean };

  const setFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  const cohortDescription = [
    lifecycle && `${words(lifecycle)} lifecycle`,
    cycle && `${words(cycle)} purchase-cycle position`,
    discount && `${words(discount)} discount behaviour`,
    search && `matching “${search}”`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader title="Customer states" description="Independent signals update as orders, engagement and time change. Campaign context still decides whether each customer is a candidate." />
      <CustomerWorkspaceNav />
      {overview.data && <MetricStrip items={[
        { label: "Profiles", value: overview.data.total.toLocaleString("en-IN") },
        { label: "Due for evaluation", value: overview.data.queue.due.toLocaleString("en-IN") },
        { label: "Updated in the last hour", value: overview.data.queue.updatedLastHour.toLocaleString("en-IN") },
        { label: "Retrying", value: overview.data.queue.failed.toLocaleString("en-IN") },
      ]} />}

      {overview.data && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Distribution title="Lifecycle" rows={overview.data.lifecycle} />
            <Distribution title="Purchase cycle" rows={overview.data.cycle} />
            <Distribution title="Discount behaviour" rows={overview.data.discounts} />
          </div>

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium text-foreground">
                  What changed in the last 24 hours
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  One digest for meaningful movements—not one notification per customer.
                </p>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">
                {overview.data.total.toLocaleString("en-IN")} profiles
              </span>
            </div>
            {overview.data.transitions.length === 0 ? (
              <p className="mt-5 rounded-lg bg-muted/40 px-4 py-5 text-sm text-muted-foreground">
                No meaningful state changes were recorded in this window.
              </p>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {overview.data.transitions.map((transition) => (
                  <div
                    key={`${transition.dimension}-${transition.fromValue}-${transition.toValue}`}
                    className="rounded-lg border border-border px-3 py-3"
                  >
                    <p className="text-sm text-foreground">
                      <strong>{transition.count.toLocaleString("en-IN")}</strong> moved to{" "}
                      <span className="capitalize">{words(transition.toValue)}</span>
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {words(transition.dimension)} · from {words(transition.fromValue)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium text-foreground">Explore profiles</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Build a cohort from state, then let campaign safety and control assignment run
                normally.
              </p>
            </div>
            <button
              type="button"
              disabled={!cohortDescription || !explorer.data?.total}
              onClick={() =>
                submitToJoon(
                  `Draft an email campaign for the ${explorer.data?.total ?? 0} customers in this saved state view: ${cohortDescription}. Preserve these state filters as the requested audience, run the normal consent and safety checks, and let me review the audience and creative before sending.`
                )
              }
              className="rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
            >
              Draft for this cohort
            </button>
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(event) => setFilter(setSearch, event.target.value)}
              placeholder="Search by customer or email"
              className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <select
              value={lifecycle}
              onChange={(event) => setFilter(setLifecycle, event.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground"
            >
              <option value="">All lifecycle states</option>
              {LIFECYCLE.map((value) => (
                <option key={value} value={value}>
                  {words(value)}
                </option>
              ))}
            </select>
            <select
              value={cycle}
              onChange={(event) => setFilter(setCycle, event.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground"
            >
              <option value="">All cycle positions</option>
              {CYCLES.map((value) => (
                <option key={value} value={value}>
                  {words(value)}
                </option>
              ))}
            </select>
            <select
              value={discount}
              onChange={(event) => setFilter(setDiscount, event.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground"
            >
              <option value="">All discount behaviours</option>
              {DISCOUNTS.map((value) => (
                <option key={value} value={value}>
                  {words(value)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="divide-y divide-border">
          {explorer.isLoading ? (
            [0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse bg-muted/30 motion-reduce:animate-none"
              />
            ))
          ) : explorer.data?.states.length ? (
            explorer.data.states.map((state) => (
              <Link
                key={state.id}
                href={`/customers/${state.customer.id}`}
                className="grid gap-3 px-4 py-4 transition-colors hover:bg-muted/30 sm:grid-cols-[1.2fr_1.7fr_1fr] sm:items-center"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {customerName(state.customer)}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {state.customer.email}
                  </p>
                </div>
                <div>
                  <p className="text-[12px] capitalize text-foreground">
                    {words(state.lifecycleStage)} · {words(state.purchaseCyclePosition)} ·{" "}
                    {words(state.discountBehavior)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {state.medianOrderIntervalDays
                      ? `usual cycle ${Math.round(state.medianOrderIntervalDays)} days · `
                      : ""}
                    reorder confidence {Math.round(state.reorderConfidence * 100)}% ·{" "}
                    {words(state.consentState)} · {words(state.deliveryHealth)}
                  </p>
                </div>
                <div className="text-[11px] text-muted-foreground sm:text-right">
                  <span className="block text-foreground">Re-evaluate</span>
                  {formatDate(state.nextEvaluationAt)}
                </div>
              </Link>
            ))
          ) : (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-medium text-foreground">
                No profiles match these filters.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Clear a filter or wait for the initial state sync to finish.
              </p>
            </div>
          )}
        </div>

        {explorer.data && explorer.data.pages > 1 && (
          <nav
            className="flex items-center justify-between border-t border-border px-4 py-3"
            aria-label="State explorer pagination"
          >
            <span className="text-xs tabular-nums text-muted-foreground">
              {explorer.data.total.toLocaleString("en-IN")} profiles · page {explorer.data.page} of{" "}
              {explorer.data.pages}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
                className="rounded-md border border-border p-1.5 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={page === explorer.data.pages}
                onClick={() => setPage((value) => value + 1)}
                className="rounded-md border border-border p-1.5 disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </nav>
        )}
      </section>
    </main>
  );
}
