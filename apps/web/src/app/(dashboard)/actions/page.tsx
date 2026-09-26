"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Clock3, Loader2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { MetricStrip, PageHeader, Surface } from "@/components/ui/AppPrimitives";
import type { OpTagKind, DecisionPrediction } from "@/components/console";
import { formatStoreCurrency } from "@/components/console/MetricReadout";
import { formatDecisionTime } from "@/lib/decision-time";

// ---------------------------------------------------------------------------
// Action shape (autonomy.listActions) — surfaced in operator language.
// ---------------------------------------------------------------------------

interface Action {
  id: string;
  type?: string | null;
  category?: string | null;
  status: string;
  reasoning?: string | null;
  campaignName?: string | null;
  confidenceScore?: number | null;
  urgencyScore?: number | null;
  estimatedRevenue?: number | null;
  expiresAt?: string | null;
  archetype?: string | null;
  targetSegment?: { count?: number | null } | null;
  prediction?: DecisionPrediction | null;
  lastEvaluatedAt?: string | null;
  lifecycle?: string | null;
  createdAt?: string | null;
  artifactId?: string | null;
  artifactType?: string | null;
  artifactStatus?: string | null;
  offer?: string | null;
  scheduledAt?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers — derive tags / reasoning / readouts from an action.
// ---------------------------------------------------------------------------

// Map an autonomy action's category/type/archetype to operator tag(s).
function actionToTags(action: Action): OpTagKind[] {
  const hay =
    `${action.category ?? ""} ${action.type ?? ""} ${action.archetype ?? ""}`.toLowerCase();
  const tags: OpTagKind[] = [];
  if (/win.?back|lapsed|hibernat|lost|churn|recover|reorder|repurchase/.test(hay))
    tags.push("win-back");
  if (/welcome|onboard|first|new/.test(hay)) tags.push("welcome");
  if (/vip|champion|loyal|reward|best/.test(hay)) tags.push("vip");
  if (/apolog|late|pre.?empt|issue|delay|ship/.test(hay)) tags.push("pre-empt");
  if (/fatigue|suppress|hold|cap|frequen/.test(hay)) tags.push("fatigue");
  if (/time|timing|send.?time|schedul|clock/.test(hay)) tags.push("timing");
  if (tags.length === 0) tags.push("memory");
  return tags.slice(0, 2);
}

// First sentence of a reasoning blob, trimmed.
function firstLine(text: string | null | undefined, max = 140): string {
  if (!text) return "";
  const t = text.trim();
  const sentence = t.split(/(?<=[.!?])\s/)[0] ?? t;
  return sentence.length > max ? sentence.slice(0, max) + "…" : sentence;
}

// Confidence as a warm mono readout label.
function confidenceLabel(score: number | null | undefined): string {
  const s = score ?? 0;
  if (s >= 80) return `confident · ${s}%`;
  if (s >= 50) return `fairly sure · ${s}%`;
  return `a hunch · ${s}%`;
}

// "expires in …" in warm voice, or null if no expiry.
function expiresIn(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "the moment has passed";
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "expires within the hour";
  if (hours < 24) return `expires in ${hours}h`;
  return `expires in ${Math.floor(hours / 24)}d`;
}

// The one-line decision in joon's warm voice — what joon wants to do.
// When there's no campaign name, the first reasoning sentence becomes the
// headline; buildReasoning() then knows to skip it so it never appears twice.
function decisionLine(action: Action): string {
  if (action.campaignName) return action.campaignName;
  const r = firstLine(action.reasoning, 110);
  if (r) return r;
  return "joon lined up something worth doing";
}

// ---------------------------------------------------------------------------
// Decision Queue — joon's queue of decisions, in the operator console.
// ---------------------------------------------------------------------------

export default function ActionsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [view, setView] = useState<"pending" | "completed" | "passed" | "all">("pending");
  const [preparedSince, setPreparedSince] = useState<string | null>(null);
  const [requestedDecisionId, setRequestedDecisionId] = useState<string | null>(null);
  const [urlScopeLoaded, setUrlScopeLoaded] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view");
    const decisionId = params.get("decision");
    if (requestedView === "all" || requestedView === "prepared24h") setView("all");
    if (requestedView === "prepared24h") setPreparedSince(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if (decisionId) { setRequestedDecisionId(decisionId); setSelectedId(decisionId); setView("all"); }
    setUrlScopeLoaded(true);
  }, []);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const { data: stores } = trpc.stores.list.useQuery();
  const workspaceStores = stores as Array<{ id: string; currency?: string | null }> | undefined;
  const linkedActionQuery = (trpc as any).autonomy.getActionById.useQuery(
    { actionId: requestedDecisionId ?? "" },
    { enabled: !!requestedDecisionId && urlScopeLoaded },
  ) as { data?: (Action & { storeId: string; payload?: unknown }) | null; isError: boolean };
  const linkedRaw = linkedActionQuery.data;
  const linkedPayload = linkedRaw?.payload && typeof linkedRaw.payload === "object"
    ? linkedRaw.payload as Record<string, unknown>
    : {};
  const linkedAction: Action | null = linkedRaw ? {
    ...linkedRaw,
    status: linkedRaw.status === "pending" && linkedRaw.expiresAt && new Date(linkedRaw.expiresAt) <= new Date() ? "expired" : linkedRaw.status,
    campaignName: typeof linkedPayload.campaignName === "string" ? linkedPayload.campaignName : null,
    offer: typeof linkedPayload.offer === "string" ? linkedPayload.offer : null,
    targetSegment: linkedPayload.targetSegment && typeof linkedPayload.targetSegment === "object" ? linkedPayload.targetSegment as Action["targetSegment"] : null,
    scheduledAt: typeof linkedPayload.scheduledAt === "string" ? linkedPayload.scheduledAt : null,
  } : null;
  const selectedStore = workspaceStores?.find((store) => store.id === linkedRaw?.storeId) ?? workspaceStores?.[0];
  const storeId = selectedStore?.id ?? "";
  const storeCurrency = selectedStore?.currency ?? "USD";

  const actionsQuery = (trpc as any).autonomy.listActions.useInfiniteQuery(
    { storeId, limit: 100, ...(preparedSince ? { createdSince: preparedSince } : {}) },
    { enabled: !!storeId && urlScopeLoaded, refetchInterval: 15000, getNextPageParam: (lastPage: { nextCursor: number | null }) => lastPage.nextCursor ?? undefined }
  ) as { data: { pages: Array<{ actions: Action[]; total: number; statusCounts?: Record<string, number>; pendingEstimatedRevenue?: number; pendingActionIds?: string[]; nextCursor: number | null }> } | undefined; isLoading: boolean; hasNextPage?: boolean; isFetchingNextPage?: boolean; fetchNextPage: () => void };
  const isLoading = !urlScopeLoaded || actionsQuery.isLoading;
  const summary = actionsQuery.data?.pages[0];

  const utils = trpc.useUtils();
  const invalidate = () => (utils as any).autonomy.listActions.invalidate();

  const approveMut = (trpc as any).autonomy.approveAction.useMutation({
    onSuccess: (result: { executedType?: string; resultId?: string }) => {
      const msg =
        result.executedType === "campaign"
          ? "Done. Your campaign's ready in Campaigns."
          : result.executedType === "automation"
            ? "Done. That automation is live."
            : "Approved. joon's on it.";
      toast(msg, "success");
      invalidate();
      if (result.executedType === "campaign" && result.resultId) {
        router.push(`/campaigns/${result.resultId}`);
      } else if (result.executedType === "automation" && result.resultId) {
        router.push(`/automations/${result.resultId}`);
      }
    },
    onError: (err: { message?: string }) =>
      toast(err.message || "That didn't go through. Give it another try.", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const rejectMut = (trpc as any).autonomy.rejectAction.useMutation({
    onSuccess: () => {
      toast("Passed on it.", "success");
      invalidate();
    },
    onError: (err: { message?: string }) =>
      toast(err.message || "That didn't go through. Give it another try.", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const bulkApproveMut = (trpc as any).autonomy.bulkApprove.useMutation({
    onSuccess: (result: { approved: number }) => {
      toast(`${result.approved} approved and live.`, "success");
      invalidate();
    },
    onError: (err: { message?: string }) =>
      toast(err.message || "That didn't go through. Give it another try.", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const bulkRejectMut = (trpc as any).autonomy.bulkReject.useMutation({
    onSuccess: (result: { rejected: number }) => {
      toast(`${result.rejected} cleared.`, "success");
      invalidate();
    },
    onError: (err: { message?: string }) =>
      toast(err.message || "That didn't go through. Give it another try.", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const listedActions = actionsQuery.data?.pages.flatMap((page) => page.actions) ?? [];
  const actions = linkedAction && !listedActions.some((action) => action.id === linkedAction.id)
    ? [linkedAction, ...listedActions]
    : listedActions;
  const pending = actions.filter((a) => a.status === "pending");
  const completed = actions.filter((a) => ["approved", "executed"].includes(a.status));
  const passed = actions.filter((a) => ["rejected", "expired", "failed"].includes(a.status));
  const visible = useMemo(() => {
    const pool = view === "pending" ? pending : view === "completed" ? completed : view === "passed" ? passed : actions;
    const needle = query.trim().toLowerCase();
    return needle ? pool.filter((action) => `${decisionLine(action)} ${action.reasoning ?? ""} ${action.category ?? ""}`.toLowerCase().includes(needle)) : pool;
  }, [actions, completed, passed, pending, query, view]);
  useEffect(() => {
    if (!visible.length) setSelectedId(null);
    else if (!selectedId || !visible.some((action) => action.id === selectedId)) setSelectedId(visible[0]!.id);
  }, [selectedId, visible]);
  useEffect(() => {
    if (linkedAction?.id === requestedDecisionId) setSelectedId(linkedAction.id);
  }, [linkedAction?.id, requestedDecisionId]);
  const selected = visible.find((action) => action.id === selectedId) ?? null;
  const busy = approveMut.isPending || rejectMut.isPending;
  const bulkBusy = bulkApproveMut.isPending || bulkRejectMut.isPending;

  // Status line — total estimated impact across the queue, in store currency.
  const totalImpact = summary?.pendingEstimatedRevenue ?? pending.reduce((sum, a) => sum + (a.estimatedRevenue ?? 0), 0);
  const pendingCount = summary?.statusCounts?.pending ?? pending.length;
  const completedCount = summary?.statusCounts
    ? (summary.statusCounts.approved ?? 0) + (summary.statusCounts.executed ?? 0)
    : completed.length;
  const passedCount = summary?.statusCounts
    ? (summary.statusCounts.rejected ?? 0) + (summary.statusCounts.expired ?? 0) + (summary.statusCounts.failed ?? 0)
    : passed.length;

  const handleBulkApprove = () => bulkApproveMut.mutate({ actionIds: summary?.pendingActionIds ?? pending.map((a) => a.id) });
  const handleBulkReject = () =>
    bulkRejectMut.mutate({
      actionIds: summary?.pendingActionIds ?? pending.map((a) => a.id),
      reason: "Cleared by operator",
    });

  const formatMoney = (value: number | null | undefined) => formatStoreCurrency(value ?? 0, storeCurrency);
  const artifactHref = selected?.artifactId && selected.artifactType === "automation"
    ? `/automations/${selected.artifactId}`
    : selected?.artifactId && selected.artifactType === "campaign"
      ? `/campaigns/${selected.artifactId}`
      : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Decisions" description="Review what Joon prepared, the evidence behind it and exactly what approval will create." actions={pendingCount > 1 && !preparedSince ? <><button onClick={handleBulkReject} disabled={bulkBusy} className="min-h-10 rounded-lg border border-border bg-[var(--surface)] px-4 text-[13px] font-medium disabled:opacity-50">Pass on all</button><button onClick={handleBulkApprove} disabled={bulkBusy} className="app-attention-button min-h-10 px-4 text-[13px] font-medium disabled:opacity-50">Approve all {pendingCount}</button></> : null} />
      {preparedSince ? <p className="text-[13px] text-muted-foreground">Showing actions created in the last 24 hours. Counts below apply to this window. <Link href="/actions" className="font-medium text-[var(--attention)]">See the full decision queue →</Link></p> : null}
      {requestedDecisionId && linkedActionQuery.isError ? <p role="alert" className="text-[13px] text-[var(--risk)]">That linked decision is no longer available. The current decision queue is shown below.</p> : null}
      <MetricStrip items={[{ label: "Needs you", value: pendingCount }, { label: "Expected value", value: formatMoney(totalImpact) }, { label: "Completed", value: completedCount }, { label: "Passed or expired", value: passedCount }]} />
      <div className="app-tab-bed" role="tablist" aria-label="Decision views">
        {([ ["pending", `Needs you · ${pendingCount}`], ["completed", `Completed · ${completedCount}`], ["passed", `Passed / expired · ${passedCount}`], ["all", `All · ${summary?.total ?? actions.length}`] ] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={view === id} className="app-tab" onClick={() => setView(id)}>{label}</button>)}
      </div>
      <div className="grid min-h-[560px] gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Surface className="overflow-hidden">
          <div className="border-b border-border p-3"><label className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-[var(--surface)] px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search decisions" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" /></label></div>
          {isLoading ? <div className="flex items-center justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : visible.length ? <ul className="divide-y divide-border" role="listbox" aria-label="Decisions">{visible.map((action) => {
            const active = action.id === selected?.id;
            const exp = expiresIn(action.expiresAt);
            return <li key={action.id} role="presentation"><button role="option" onClick={() => { setSelectedId(action.id); setInspectorOpen(true); }} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-4 px-4 py-4 text-left transition-colors ${active ? "bg-[var(--surface-soft)]" : "hover:bg-[var(--surface-soft)]/60"}`} aria-selected={active}><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="truncate text-[14px] font-medium">{decisionLine(action)}</span><span className="rounded-full bg-[var(--evidence-soft)] px-2 py-0.5 text-[11px] text-[var(--evidence)]">{action.status}</span></span><span className="mt-1 block line-clamp-2 text-[13px] leading-5 text-muted-foreground">{firstLine(action.reasoning, 150) || "Prepared for review."}</span><span className="mt-2 flex flex-wrap gap-3 text-[12px] text-muted-foreground">{formatDecisionTime(action.createdAt) ? <span>First prepared {formatDecisionTime(action.createdAt)}</span> : null}<span>{confidenceLabel(action.confidenceScore)}</span>{exp && <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{exp}</span>}</span></span><span className="flex items-center gap-2"><span className="font-mono text-[12px] tabular-nums text-[var(--attention)]">{action.estimatedRevenue ? `~${formatMoney(action.estimatedRevenue)}` : ""}</span><ChevronRight className="h-4 w-4 text-muted-foreground" /></span></button></li>;
          })}</ul> : <div className="px-6 py-20 text-center"><p className="text-[15px] font-medium">Nothing in this view</p><p className="mt-1 text-[13px] text-muted-foreground">Joon will place the next material decision here with its evidence.</p></div>}
          {actionsQuery.hasNextPage && <div className="border-t border-border p-3 text-center"><button onClick={() => actionsQuery.fetchNextPage()} disabled={actionsQuery.isFetchingNextPage} className="min-h-9 rounded-lg border border-border px-4 text-[13px] font-medium disabled:opacity-50">{actionsQuery.isFetchingNextPage ? "Loading…" : "Load older decisions"}</button></div>}
        </Surface>
        {inspectorOpen && <button className="fixed inset-0 z-40 bg-black/25 lg:hidden" onClick={() => setInspectorOpen(false)} aria-label="Close decision inspector" />}
        <aside className={`${inspectorOpen ? "fixed inset-x-3 bottom-3 top-20 z-50 overflow-auto" : "hidden"} lg:sticky lg:top-0 lg:z-auto lg:block lg:self-start`} aria-label="Selected decision">
          <Surface className="overflow-hidden">{selected ? <>
            <div className="border-b border-border p-5"><button onClick={() => setInspectorOpen(false)} className="float-right rounded-md p-1 text-muted-foreground lg:hidden" aria-label="Close inspector"><X className="h-5 w-5" /></button><div className="flex flex-wrap gap-2">{actionToTags(selected).map((tag) => <span key={tag} className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[11px]">{tag.replace(/-/g, " ")}</span>)}</div><h2 className="mt-3 text-[20px] font-medium leading-7">{decisionLine(selected)}</h2><p className="mt-2 text-[13px] leading-5 text-muted-foreground">{selected.reasoning || "Joon prepared this for your review."}</p></div>
            <dl className="divide-y divide-border text-[13px]">{[
              ["Audience", selected.targetSegment?.count ? `${selected.targetSegment.count.toLocaleString("en-IN")} customers` : "Not specified"],
              ["Offer", selected.offer ?? "No offer specified"],
              ["Delivery", selected.scheduledAt ? new Date(selected.scheduledAt).toLocaleString("en-IN") : "Set when the artifact is reviewed"],
              ["Expected value", selected.estimatedRevenue ? formatMoney(selected.estimatedRevenue) : "No estimate"],
              ["Confidence", confidenceLabel(selected.confidenceScore)],
              ["First prepared", formatDecisionTime(selected.createdAt) ?? "—"],
              ["Last evaluated", formatDecisionTime(selected.lastEvaluatedAt) ?? "—"],
              ["Expires", formatDecisionTime(selected.expiresAt) ? `${formatDecisionTime(selected.expiresAt)} · ${expiresIn(selected.expiresAt) ?? "expired"}` : "No expiry"],
            ].map(([label, value]) => <div key={label} className="grid grid-cols-[112px_1fr] gap-3 px-5 py-3"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>
            {selected.prediction && <div className="border-t border-border bg-[var(--evidence-soft)]/55 p-5"><p className="text-[12px] font-medium text-[var(--evidence)]">Predicted consequence · {selected.prediction.basis === "calibrated" ? "control-backed" : "estimate"}</p><p className="mt-2 text-[13px]">Upside: {formatMoney(selected.prediction.upsideRevenue)} · Risk: {selected.prediction.downsideRiskPct}% unsubscribe or annoyance · {selected.prediction.confidence} confidence</p></div>}
            <div className="flex flex-wrap gap-2 border-t border-border p-4">{artifactHref && <Link href={artifactHref} className="min-h-10 rounded-lg border border-border px-4 py-2.5 text-[13px] font-medium">Open artifact</Link>}{selected.status === "pending" && <><button onClick={() => rejectMut.mutate({ actionId: selected.id, reason: "Passed from decision queue" })} disabled={busy} className="min-h-10 rounded-lg border border-border px-4 text-[13px] font-medium disabled:opacity-50"><X className="mr-1 inline h-4 w-4" />Pass</button><button onClick={() => approveMut.mutate({ actionId: selected.id })} disabled={busy} className="app-attention-button min-h-10 px-4 text-[13px] font-medium disabled:opacity-50"><Check className="mr-1 inline h-4 w-4" />Approve</button></>}</div>
          </> : <div className="p-8 text-center text-[13px] text-muted-foreground">Select a decision to inspect its evidence and consequence.</div>}</Surface>
        </aside>
      </div>
    </div>
  );
}
