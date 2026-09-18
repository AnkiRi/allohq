"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Clock, Eye, Loader2, Mail, MoreHorizontal, MousePointerClick, Plus, Send, Sparkles, Trash2, Users, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { SmartEmptyState } from "@/components/ui/SmartEmptyState";
import { useAlloAI } from "@/components/ai/AlloAIPanel";
import { MetricStrip, PageHeader } from "@/components/ui/AppPrimitives";

const STATUS_CONFIG: Record<string, { icon: typeof Check; tone: string; label: string }> = {
  draft: { icon: Clock, tone: "bg-[var(--surface-soft)] text-[var(--text-muted)]", label: "Draft" },
  scheduled: { icon: Clock, tone: "bg-[var(--attention-soft)] text-[var(--attention)]", label: "Scheduled" },
  sending: { icon: Send, tone: "bg-[var(--attention-soft)] text-[var(--attention)]", label: "Sending" },
  partially_sent: { icon: AlertTriangle, tone: "bg-[var(--risk-soft)] text-[var(--risk)]", label: "Partially sent" },
  failed: { icon: XCircle, tone: "bg-[var(--risk-soft)] text-[var(--risk)]", label: "Failed" },
  sent: { icon: Check, tone: "bg-[var(--success-soft)] text-[var(--success-color)]", label: "Sent" },
  cancelled: { icon: XCircle, tone: "bg-[var(--surface-soft)] text-[var(--text-muted)]", label: "Cancelled" },
};

export default function CampaignsPage() {
  const { submit: submitToJoon } = useAlloAI();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const { data: campaigns, isLoading, error, refetch, isFetching } = (trpc.campaigns.list as any).useQuery(undefined) as {
    data: any[] | undefined;
    isLoading: boolean;
    isFetching: boolean;
    error: { message?: string } | null;
    refetch: () => Promise<unknown>;
  };
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const deleteMut = (trpc.campaigns.delete as any).useMutation({ onSuccess: () => { utils.campaigns.list.invalidate(); toast("Draft deleted.", "info"); }, onError: () => toast("We couldn't delete that. Mind trying again?", "error") }) as { mutate: (v: { id: string }) => void; isPending: boolean; variables?: { id: string } };
  const statuses = [{ value: undefined, label: "All" }, { value: "draft", label: "Drafts" }, { value: "scheduled", label: "Scheduled" }, { value: "attention", label: "Needs attention" }, { value: "sent", label: "Sent" }];
  const count = (status: string) => campaigns?.filter((c: any) => (c.deliveryStatus ?? c.status) === status).length ?? 0;
  const visibleCampaigns = campaigns?.filter((campaign: any) => {
    if (!statusFilter) return true;
    const status = campaign.deliveryStatus ?? campaign.status;
    return statusFilter === "attention" ? status === "partially_sent" || status === "failed" : status === statusFilter;
  });

  return <div className="space-y-7">
    <PageHeader eyebrow="Campaign workspace" title="Campaigns" description="Draft, approve and deliver—without losing the reasoning behind each send." actions={<><button type="button" onClick={() => submitToJoon("Create an email with me. Ask for the audience, goal, offer, products and image direction, preserve them as campaign constraints, and let me review the editable draft before delivery.")} className="inline-flex min-h-10 items-center gap-2 rounded-[9px] border border-border bg-[var(--surface)] px-4 text-[13px] font-medium"><Sparkles className="h-4 w-4" />Create with Joon</button><Link href="/campaigns/new" className="app-attention-button inline-flex min-h-10 items-center gap-2 px-4 text-[13px] font-medium"><Plus className="h-4 w-4" />New campaign</Link></>} />

    {error ? <section className="rounded-xl border border-[var(--risk)]/35 bg-[var(--risk-soft)] p-5" role="alert"><h2 className="text-[15px] font-medium text-foreground">Campaign data did not load</h2><p className="mt-1 text-[14px] text-muted-foreground">The numbers below have not been replaced with zero. Try the request again; your saved campaigns are unchanged.</p><button type="button" disabled={isFetching} onClick={() => void refetch()} className="mt-4 inline-flex min-h-9 items-center rounded-lg border border-[var(--risk)]/30 bg-[var(--surface)] px-4 text-[13px] font-medium disabled:opacity-50">{isFetching ? "Trying again…" : "Try again"}</button></section> : <MetricStrip items={[{ label: "Drafts", value: isLoading ? "—" : count("draft") }, { label: "Scheduled", value: isLoading ? "—" : count("scheduled") }, { label: "Sent", value: isLoading ? "—" : count("sent") }, { label: "Needs attention", value: isLoading ? "—" : count("partially_sent") + count("failed") }]} />}

    <div className="app-tab-bed max-w-full overflow-x-auto" role="tablist" aria-label="Campaign status">
      {statuses.map((s) => <button key={s.label} role="tab" aria-selected={statusFilter === s.value} onClick={() => setStatusFilter(s.value)} className="app-tab whitespace-nowrap">{s.label}</button>)}
    </div>

    {error ? null : isLoading ? <div className="app-surface divide-y divide-border">{[1,2,3].map(i => <div key={i} className="h-[88px] animate-pulse bg-[var(--surface-soft)]/50" />)}</div> : visibleCampaigns?.length ? <div className="app-surface overflow-hidden">
      <div className="hidden grid-cols-[minmax(260px,1fr)_180px_115px_190px_42px] gap-4 border-b border-border px-5 py-3 text-[12px] text-muted-foreground md:grid"><span>Campaign</span><span>Audience</span><span>Status</span><span>Performance</span><span /></div>
      <div className="divide-y divide-border">{visibleCampaigns.map((campaign: any) => {
        const displayStatus = campaign.deliveryStatus ?? campaign.status;
        const status = STATUS_CONFIG[displayStatus] ?? STATUS_CONFIG.draft!;
        const StatusIcon = status.icon;
        return <Link key={campaign.id} href={`/campaigns/${campaign.id}`} className="group grid gap-3 px-4 py-4 hover:bg-[var(--surface-soft)]/45 md:grid-cols-[minmax(260px,1fr)_180px_115px_190px_42px] md:items-center md:px-5">
          <div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-[var(--surface)]"><Mail className="h-4 w-4 text-muted-foreground" /></span><div className="min-w-0"><p className="truncate text-[14px] font-medium">{campaign.name}</p><p className="mt-0.5 truncate text-[12px] text-muted-foreground">{campaign.template?.subject ?? "No subject"}</p></div></div>
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Users className="h-3.5 w-3.5" /><span className="truncate">{campaign.segment ? `${campaign.segment.name} · ${campaign.segment.customerCount}` : "All subscribers"}</span></div>
          <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${status.tone}`}><StatusIcon className="h-3.5 w-3.5" />{status.label}</span>
          <div className="flex items-center gap-4 text-[12px] text-muted-foreground">{displayStatus === "sent" ? <><span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{(campaign.openRate * 100).toFixed(1)}%</span><span className="inline-flex items-center gap-1"><MousePointerClick className="h-3.5 w-3.5" />{(campaign.clickRate * 100).toFixed(1)}%</span><span>{campaign.attributedOrders ?? 0} orders</span></> : <span>—</span>}</div>
          <div className="flex justify-end">{campaign.status === "draft" ? <button aria-label="Delete draft" onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (window.confirm(`Delete the draft “${campaign.name}”? This can't be undone.`)) deleteMut.mutate({ id: campaign.id }); }} className="rounded-lg p-2 text-muted-foreground opacity-0 hover:bg-[var(--risk-soft)] hover:text-[var(--risk)] group-hover:opacity-100 focus:opacity-100">{deleteMut.isPending && deleteMut.variables?.id === campaign.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button> : <MoreHorizontal className="h-4 w-4 text-muted-foreground" />}</div>
        </Link>;
      })}</div>
    </div> : <SmartEmptyState icon={Mail} title="No campaigns yet. Want Joon to draft one?" description="Joon has spotted a few moments worth reaching out about." actions={[{ label: "Create a campaign", href: "/campaigns/new", primary: true }]} />}
  </div>;
}
