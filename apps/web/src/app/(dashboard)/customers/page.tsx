"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { CommandLine, formatINR } from "@/components/console";
import { CustomerWorkspaceNav } from "@/components/customers/CustomerWorkspaceNav";
import { MetricStrip, PageHeader, Surface } from "@/components/ui/AppPrimitives";

const SEGMENTS = ["All", "Subscribers", "Champions", "Loyal Customers", "Potential Loyalists", "New Customers", "At Risk", "Can't Lose Them", "Hibernating", "Lost"];
function noOrders(customer: any) { return (customer.rfmScore?.orderCount ?? customer._count.orders) === 0; }
function customerName(customer: any) { return [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email; }
function commandIntent(raw: string) {
  const value = raw.toLowerCase().trim();
  if (/\b(at[\s-]?risk|slipping|churn|leaving)\b/.test(value)) return { segment: "At Risk" };
  if (/\b(lapsed|dormant|inactive|hibernat|gone quiet|90 days)\b/.test(value)) return { segment: "Hibernating" };
  if (/\b(lost|churned)\b/.test(value)) return { segment: "Lost" };
  if (/\b(vip|best|top|biggest spender|champion)\b/.test(value)) return { segment: "Champions" };
  if (/\b(loyal|repeat|regular)\b/.test(value)) return { segment: "Loyal Customers" };
  if (/\b(subscriber|subscribed|no orders?|never purchased)\b/.test(value)) return { segment: "Subscribers" };
  if (/\b(new|first[\s-]?time|recent sign)\b/.test(value)) return { segment: "New Customers" };
  return { search: raw.trim() };
}

export default function CustomersPage() { return <Suspense><CustomersWorkspace /></Suspense>; }

function CustomersWorkspace() {
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("All");
  const [page, setPage] = useState(1);
  useEffect(() => { const value = params.get("segment"); if (value && SEGMENTS.includes(value)) { setSegment(value); setPage(1); } }, [params]);
  const { data: stats } = trpc.customers.stats.useQuery();
  const { data, isLoading } = trpc.customers.list.useQuery({ page, limit: 20, search: search || undefined, segment: segment === "All" ? undefined : segment });
  const { data: distribution } = trpc.segments.distribution.useQuery();
  const atRisk = ((distribution ?? []) as any[]).filter((row) => row.segment === "At Risk" || row.segment === "Hibernating").reduce((sum, row) => sum + row.customerCount, 0);

  return <main className="mx-auto w-full max-w-7xl space-y-6">
    <PageHeader title="Customers" description="Understand who is ready for contact, who Joon is deliberately leaving alone and what evidence will change that decision." />
    <CustomerWorkspaceNav />
    <CommandLine placeholder={["show me at-risk customers", "who hasn't bought in 90 days?", "find my VIPs", "search by name or email"]} onSubmit={(value) => { const intent = commandIntent(value); setPage(1); if (intent.segment) { setSegment(intent.segment); setSearch(""); } else { setSegment("All"); setSearch(intent.search ?? ""); } }} />
    <MetricStrip items={[
      { label: "Subscribed audience", value: stats ? Math.round(stats.totalCustomers * stats.marketingRate / 100).toLocaleString("en-IN") : "—" },
      { label: "Needs attention", value: atRisk.toLocaleString("en-IN") },
      { label: "Email opt-in", value: stats ? `${stats.marketingRate.toFixed(0)}%` : "—" },
      { label: "Revenue observed", value: stats ? formatINR(stats.totalRevenue) : "—" },
    ]} />
    <Surface className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name or email" className="h-9 w-full rounded-lg border border-border bg-[var(--surface)] pl-9 pr-3 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-[var(--surface-soft)] p-1">{SEGMENTS.map((item) => <button key={item} onClick={() => { setSegment(item); setPage(1); }} className={`min-h-8 shrink-0 rounded-md px-3 text-[12px] font-medium ${segment === item ? "bg-[var(--surface)] text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{item}</button>)}</div>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px]">
        <thead><tr className="border-b border-border text-left text-[12px] text-muted-foreground"><th className="px-5 py-3 font-medium">Customer</th><th className="px-5 py-3 font-medium">Current cohort</th><th className="px-5 py-3 text-right font-medium">Orders</th><th className="px-5 py-3 text-right font-medium">Total spent</th><th className="px-5 py-3 text-right font-medium">RFM</th><th className="px-5 py-3 font-medium">Reachability</th></tr></thead>
        <tbody className="divide-y divide-border">{isLoading ? Array.from({ length: 6 }).map((_, index) => <tr key={index}><td colSpan={6} className="px-5 py-4"><div className="h-5 animate-pulse rounded bg-[var(--surface-soft)] motion-reduce:animate-none" /></td></tr>) : !data?.customers.length ? <tr><td colSpan={6} className="px-5 py-16 text-center"><Users className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-3 text-[14px] font-medium">No customers match this view</p><p className="mt-1 text-[13px] text-muted-foreground">Clear a filter or search another name or email.</p></td></tr> : data.customers.map((customer: any) => {
          const subscriber = noOrders(customer);
          const cohort = subscriber ? customer.acceptsMarketing ? "Subscriber" : "Not subscribed" : customer.rfmScore?.segment ?? "Unclassified";
          return <tr key={customer.id} className="hover:bg-[var(--surface-soft)]/55"><td className="px-5 py-4"><Link href={`/customers/${customer.id}`} className="block"><span className="text-[14px] font-medium">{customerName(customer)}</span><span className="mt-0.5 block text-[12px] text-muted-foreground">{customer.email}</span></Link></td><td className="px-5 py-4 text-[13px]">{cohort}</td><td className="px-5 py-4 text-right font-mono text-[13px] tabular-nums">{customer.rfmScore?.orderCount ?? customer._count.orders}</td><td className="px-5 py-4 text-right font-mono text-[13px] tabular-nums">{formatINR(customer.rfmScore?.totalSpent ?? 0)}</td><td className="px-5 py-4 text-right font-mono text-[13px] tabular-nums">{customer.rfmScore?.totalScore ?? "—"}</td><td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-[11px] ${customer.acceptsMarketing ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--surface-soft)] text-muted-foreground"}`}>{customer.acceptsMarketing ? "Subscribed" : "Not subscribed"}</span></td></tr>;
        })}</tbody>
      </table></div>
      {data && data.pages > 1 && <div className="flex items-center justify-between border-t border-border px-5 py-3"><span className="text-[12px] text-muted-foreground">{data.total.toLocaleString("en-IN")} customers · page {data.page} of {data.pages}</span><div className="flex gap-1"><button aria-label="Previous page" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-border p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><button aria-label="Next page" disabled={page === data.pages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-border p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>}
    </Surface>
  </main>;
}
