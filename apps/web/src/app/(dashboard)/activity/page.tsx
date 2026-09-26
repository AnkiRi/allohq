"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Loader2, Search, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { MetricStrip, PageHeader, Surface } from "@/components/ui/AppPrimitives";
import { formatStoreCurrency } from "@/components/console/MetricReadout";

const TZ = "Asia/Kolkata";
const LABELS: Record<string, string> = {
  cart_recovery_sent: "Cart recovery", churn_intervention: "Win-back",
  ab_test_concluded: "A/B test concluded", campaign_opportunity: "Opportunity found",
  auto_send: "Sent", browse_abandon: "Browse recovery",
};
const TIER_NOTE: Record<string, string> = { autopilot: "ran on its own", copilot: "waiting on you", advisor: "suggested" };

interface ActivityRow {
  id: string; activityType: string; summary: string; category: string | null;
  tier: string | null; actionTaken: string | null; entityId?: string | null;
  entityType?: string | null; revenue: number | null; metadata: unknown;
  createdAt: string | Date;
}
interface ActivityGroup { id: string; latest: ActivityRow; rows: ActivityRow[]; }

function labelFor(type: string) { return LABELS[type] ?? type.replace(/_/g, " "); }
function timeLabel(value: string | Date) { return new Date(value).toLocaleTimeString("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }); }
function dateLabel(value: string | Date) { return new Date(value).toLocaleDateString("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
function dayKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
function dayHeading(value: string | Date) {
  const current = dayKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const key = dayKey(value);
  if (key === current) return "Today";
  if (key === dayKey(yesterday)) return "Yesterday";
  return new Date(value).toLocaleDateString("en-IN", { timeZone: TZ, weekday: "long", day: "numeric", month: "short" });
}
function entityHref(row: ActivityRow) {
  if (!row.entityId) return null;
  if (row.entityType === "campaign") return `/campaigns/${row.entityId}`;
  if (row.entityType === "automation") return `/automations/${row.entityId}`;
  if (row.entityType === "customer") return `/customers/${row.entityId}`;
  return null;
}

export default function ActivityPage() {
  const { data: stores } = trpc.stores.list.useQuery();
  const storeCurrency = stores?.[0]?.currency ?? "USD";
  const money = (value: number | null) => value ? formatStoreCurrency(value, storeCurrency) : "—";
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "needs_you" | "sent" | "analysis">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const activityQuery = (trpc.activity.list as any).useInfiniteQuery(
    { limit: 100 },
    { refetchInterval: 60_000, getNextPageParam: (lastPage: { nextCursor: string | null }) => lastPage.nextCursor ?? undefined },
  ) as { data: { pages: Array<{ items: ActivityRow[]; nextCursor: string | null }> } | undefined; isLoading: boolean; hasNextPage?: boolean; isFetchingNextPage?: boolean; fetchNextPage: () => void };
  const { isLoading } = activityQuery;
  const items = activityQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const needsYou = items.filter((row) => row.actionTaken === "queued_for_review");
  const sent = items.filter((row) => /sent|send|delivered/.test(`${row.activityType} ${row.actionTaken}`));
  const visible = useMemo<ActivityGroup[]>(() => {
    const pool = kind === "needs_you" ? needsYou : kind === "sent" ? sent : kind === "analysis" ? items.filter((row) => !needsYou.includes(row) && !sent.includes(row)) : items;
    const needle = query.trim().toLowerCase();
    const filtered = needle ? pool.filter((row) => `${labelFor(row.activityType)} ${row.summary} ${row.category ?? ""}`.toLowerCase().includes(needle)) : pool;
    const groups = new Map<string, ActivityGroup>();
    for (const row of filtered) {
      const key = `${row.activityType}|${row.summary.trim().toLowerCase()}|${row.entityType ?? ""}|${row.entityId ?? ""}`;
      const existing = groups.get(key);
      if (existing) existing.rows.push(row);
      else groups.set(key, { id: row.id, latest: row, rows: [row] });
    }
    return [...groups.values()];
  }, [items, kind, needsYou, query, sent]);
  useEffect(() => {
    if (!visible.length) setSelectedId(null);
    else if (!selectedId || !visible.some((group) => group.id === selectedId)) setSelectedId(visible[0]!.id);
  }, [selectedId, visible]);
  const selected = visible.find((group) => group.id === selectedId) ?? null;
  const datedVisible = useMemo(() => {
    const days = new Map<string, { label: string; groups: ActivityGroup[] }>();
    for (const group of visible) {
      const key = dayKey(group.latest.createdAt);
      const existing = days.get(key);
      if (existing) existing.groups.push(group);
      else days.set(key, { label: dayHeading(group.latest.createdAt), groups: [group] });
    }
    return [...days.entries()].map(([key, value]) => ({ key, ...value }));
  }, [visible]);
  const selectedRow = selected?.latest ?? null;
  const selectedHref = selectedRow ? entityHref(selectedRow) : null;
  return <div className="space-y-6">
    <PageHeader title="Activity" description="The durable record of what Joon evaluated, proposed, changed and sent. Newest first." />
    <MetricStrip items={[{ label: "Events loaded", value: items.length }, { label: "Review events loaded", value: needsYou.length }, { label: "Delivery events loaded", value: sent.length }]} />
    <p className="text-[12px] text-muted-foreground">These are historical events from the loaded pages, not the live decision queue. Event revenue is evidence, not an additive store total. <Link href="/actions" className="font-medium text-[var(--attention)]">Open current decisions →</Link></p>
    <div className="app-tab-bed" role="tablist" aria-label="Activity views">{([ ["all", "All"], ["needs_you", `Review history · ${needsYou.length}`], ["sent", "Delivery"], ["analysis", "Analysis"] ] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={kind === id} className="app-tab" onClick={() => setKind(id)}>{label}</button>)}</div>
    <div className="grid min-h-[560px] gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Surface className="overflow-hidden">
        <div className="border-b border-border p-3"><label className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" /></label></div>
        {isLoading ? <div className="flex justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : visible.length ? <>{datedVisible.map((day) => <section key={day.key} aria-labelledby={`activity-${day.key}`}><h2 id={`activity-${day.key}`} className="sticky top-0 z-10 border-b border-border bg-[var(--surface)]/95 px-4 py-3 text-[18px] font-medium backdrop-blur-sm">{day.label}</h2><ol className="divide-y divide-border" role="listbox" aria-label={`${day.label} activity`}>{day.groups.map((group) => {
          const row = group.latest;
          const active = group.id === selected?.id;
          return <li key={group.id} role="presentation"><button role="option" onClick={() => { setSelectedId(group.id); setInspectorOpen(true); }} className={`grid w-full grid-cols-[58px_minmax(0,1fr)_auto] gap-3 px-4 py-4 text-left ${active ? "bg-[var(--surface-soft)]" : "hover:bg-[var(--surface-soft)]/60"}`} aria-selected={active}><span className="font-mono text-[12px] tabular-nums text-muted-foreground">{timeLabel(row.createdAt)}</span><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-medium">{labelFor(row.activityType)}</span>{group.rows.length > 1 && <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[12px] text-muted-foreground">{group.rows.length} runs</span>}{row.tier && <span className="text-[12px] text-muted-foreground">{TIER_NOTE[row.tier] ?? row.tier}</span>}</span><span className="mt-1 block text-[14px] leading-5 text-muted-foreground">{row.summary}</span></span><span className="flex items-center gap-2">{row.revenue ? <span className="font-mono text-[12px] text-[var(--success-color)]">{money(row.revenue)}</span> : null}<ChevronRight className="h-4 w-4 text-muted-foreground" /></span></button></li>;
        })}</ol></section>)}{activityQuery.hasNextPage && <div className="border-t border-border p-3 text-center"><button onClick={() => activityQuery.fetchNextPage()} disabled={activityQuery.isFetchingNextPage} className="min-h-9 rounded-lg border border-border px-4 text-[13px] font-medium disabled:opacity-50">{activityQuery.isFetchingNextPage ? "Loading…" : "Load earlier activity"}</button></div>}</> : <div className="px-6 py-20 text-center"><p className="text-[15px] font-medium">No activity in this view</p><p className="mt-1 text-[13px] text-muted-foreground">Background evaluations and completed work will appear here.</p></div>}
      </Surface>
      {inspectorOpen && <button className="fixed inset-0 z-40 bg-black/25 lg:hidden" onClick={() => setInspectorOpen(false)} aria-label="Close activity receipt" />}
      <aside className={`${inspectorOpen ? "fixed inset-x-3 bottom-3 top-20 z-50 overflow-auto" : "hidden"} lg:sticky lg:top-0 lg:z-auto lg:block lg:self-start`} aria-label="Activity receipt"><Surface className="overflow-hidden">{selected && selectedRow ? <>
        <header className="border-b border-border p-5"><button onClick={() => setInspectorOpen(false)} className="float-right rounded-md p-1 text-muted-foreground lg:hidden" aria-label="Close receipt"><X className="h-5 w-5" /></button><p className="font-mono text-[12px] text-muted-foreground">{dateLabel(selectedRow.createdAt)} · {timeLabel(selectedRow.createdAt)}</p><h2 className="mt-2 text-[20px] font-medium">{labelFor(selectedRow.activityType)}</h2><p className="mt-2 text-[13px] leading-5 text-muted-foreground">{selectedRow.summary}</p>{selected.rows.length > 1 && <p className="mt-3 text-[12px] text-muted-foreground">Grouped from {selected.rows.length} matching evaluations. Every run remains below.</p>}</header>
        <dl className="divide-y divide-border text-[13px]">{[["Category", selectedRow.category ?? "—"], ["Autonomy", selectedRow.tier ? TIER_NOTE[selectedRow.tier] ?? selectedRow.tier : "—"], ["Result", selectedRow.actionTaken?.replace(/_/g, " ") ?? "Recorded"], ["Event amount", money(selectedRow.revenue)], ["Latest receipt", selectedRow.id]].map(([label, value]) => <div key={label} className="grid grid-cols-[100px_1fr] gap-3 px-5 py-3"><dt className="text-muted-foreground">{label}</dt><dd className={label === "Latest receipt" ? "break-all font-mono text-[11px]" : "font-medium"}>{value}</dd></div>)}</dl>
        <details className="border-t border-border"><summary className="cursor-pointer list-none px-5 py-3 text-[13px] font-medium hover:bg-[var(--surface-soft)]">Underlying runs · {selected.rows.length}<span className="float-right">＋</span></summary><div className="max-h-72 overflow-auto border-t border-border bg-[var(--surface-soft)]">{selected.rows.map((row) => <div key={row.id} className="border-b border-border p-4 last:border-0"><p className="font-mono text-[11px] text-muted-foreground">{dateLabel(row.createdAt)} · {timeLabel(row.createdAt)} · {row.id}</p>{row.metadata ? <pre className="mt-2 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-muted-foreground">{JSON.stringify(row.metadata, null, 2)}</pre> : <p className="mt-2 text-[12px] text-muted-foreground">No additional metadata recorded.</p>}</div>)}</div></details>
        <div className="flex gap-2 border-t border-border p-4">{selectedRow.actionTaken === "queued_for_review" && <Link href="/actions" className="app-attention-button min-h-10 px-4 py-2.5 text-[13px] font-medium">Review decision</Link>}{selectedHref && <Link href={selectedHref} className="min-h-10 rounded-lg border border-border px-4 py-2.5 text-[13px] font-medium">Open related work</Link>}</div>
      </> : <div className="p-8 text-center text-[13px] text-muted-foreground">Select an event to inspect its receipt.</div>}</Surface></aside>
    </div>
  </div>;
}
