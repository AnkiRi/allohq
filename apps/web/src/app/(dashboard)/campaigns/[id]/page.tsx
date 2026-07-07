"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { ArrowLeft, Send, Mail, Users, MousePointerClick, XCircle, CheckCircle, Loader2, Eye, Maximize2, Minimize2 } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { DecisionTracePanel } from "@/components/campaigns/DecisionTracePanel";

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as string;
  const { toast } = useToast();

  const [previewExpanded, setPreviewExpanded] = useState(false);
  const { data: campaign, isLoading } = trpc.campaigns.getById.useQuery({ id: campaignId });
  const { data: stats } = trpc.campaigns.stats.useQuery({ id: campaignId });

  // Render preview from blocks if template has no pre-rendered HTML
  const templateBlocks = campaign?.template && !campaign.template.html
    ? ((campaign.template as any).blocks as any[] | undefined)
    : undefined;
  const renderMut = trpc.templates.renderPreview.useMutation();
  useEffect(() => {
    if (templateBlocks && templateBlocks.length > 0 && !renderMut.data && !renderMut.isPending) {
      renderMut.mutate({ blocks: templateBlocks });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateBlocks]);
  const utils = trpc.useUtils();
  const sendMut = trpc.campaigns.sendNow.useMutation({
    onSuccess: () => {
      utils.campaigns.getById.invalidate({ id: campaignId });
      utils.campaigns.stats.invalidate({ id: campaignId });
      toast("It's on its way.", "success");
    },
    onError: () => toast("We couldn't send that. Mind trying again?", "error"),
  });
  const cancelMut = trpc.campaigns.cancel.useMutation({
    onSuccess: () => {
      utils.campaigns.getById.invalidate({ id: campaignId });
      toast("Campaign cancelled.", "info");
    },
    onError: () => toast("We couldn't cancel that. Mind trying again?", "error"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2">
        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        <span className="text-[13px] text-muted-foreground">Loading your campaign…</span>
      </div>
    );
  }

  if (!campaign) {
    return <div className="text-[13px] text-muted-foreground font-sans">We couldn't find this campaign.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/campaigns" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-[18px] tracking-[-0.5px] font-semibold text-foreground font-serif">{campaign.name}</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">{campaign.template?.subject}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === "sent" && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))] border border-[hsl(var(--success)/0.25)] rounded-lg text-xs font-sans font-bold">
              <CheckCircle className="w-3.5 h-3.5" />
              Sent
            </span>
          )}
          {campaign.status === "sending" && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/25 rounded-lg text-xs font-sans font-bold">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Sending…
            </span>
          )}
          {(campaign.status === "draft" || campaign.status === "scheduled") && (
            <button
              onClick={() => sendMut.mutate({ id: campaignId })}
              disabled={sendMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-sans hover:bg-secondary/90 disabled:opacity-50 transition-all"
            >
              {sendMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {sendMut.isPending ? "Sending…" : "Send Now"}
            </button>
          )}
          {campaign.status === "scheduled" && (
            <button
              onClick={() => cancelMut.mutate({ id: campaignId })}
              disabled={cancelMut.isPending}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-xs font-sans text-foreground hover:border-primary/50 disabled:opacity-50 transition-all"
            >
              <XCircle className="w-3.5 h-3.5" />
              {cancelMut.isPending ? "Cancelling…" : "Cancel"}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { icon: Mail, label: "SENT", value: stats?.recipientCount?.toLocaleString() ?? "0" },
          { icon: Mail, label: "OPENED", value: stats ? `${(stats.openRate * 100).toFixed(1)}%` : "0%" },
          { icon: MousePointerClick, label: "CLICKED", value: stats ? `${(stats.clickRate * 100).toFixed(1)}%` : "0%" },
          { icon: Users, label: "RECIPIENTS", value: campaign.recipientCount.toLocaleString() },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="border border-border rounded-xl p-5 bg-card hover:border-foreground hover:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all group"
          >
            <kpi.icon className="w-5 h-5 text-muted-foreground/50 mb-3 group-hover:text-foreground transition-colors" />
            <div className="text-[10px] text-muted-foreground font-sans uppercase font-bold tracking-[1px] mb-1">{kpi.label}</div>
            <div className="text-[28px] tabular-nums font-bold text-foreground font-mono">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Campaign details */}
      <div className="border border-border rounded-xl p-6 bg-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-px h-6 bg-secondary" />
          <h2 className="text-[13px] font-bold text-foreground font-serif">Details</h2>
        </div>
        <div className="grid grid-cols-3 gap-x-8 gap-y-2">
          {[
            { label: "Status", value: campaign.status.toUpperCase() },
            { label: "Template", value: campaign.template?.name },
            { label: "Segment", value: campaign.segment?.name ?? "All Subscribers" },
            { label: "Store", value: campaign.store.shopDomain },
            { label: "Scheduled", value: campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString() : "\u2014" },
            { label: "Sent At", value: campaign.sentAt ? new Date(campaign.sentAt).toLocaleString() : "\u2014" },
          ].map((item) => (
            <div key={item.label} className="flex justify-between py-1.5 border-b border-border">
              <span className="text-[11px] text-muted-foreground font-sans">{item.label}</span>
              <span className="text-[11px] font-bold text-foreground font-sans">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* How joon decided — the moat, made legible */}
      <DecisionTracePanel campaignId={campaignId} />

      {/* Email preview — full width */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-px h-6 bg-secondary" />
            <h2 className="text-[13px] font-bold text-foreground font-serif">Email preview</h2>
          </div>
          <div className="flex items-center gap-3">
            {(campaign.template?.html || renderMut.data?.html) && (
              <button
                onClick={() => setPreviewExpanded((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-sans text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all"
              >
                {previewExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                {previewExpanded ? "Collapse" : "Full Preview"}
              </button>
            )}
            {campaign.templateId && (
              <Link
                href={`/templates/${campaign.templateId}/edit`}
                className="text-[10px] font-sans text-muted-foreground hover:text-foreground transition-colors"
              >
                Edit template &rarr;
              </Link>
            )}
          </div>
        </div>
        <div className="flex justify-center bg-muted/50 p-6">
          {(campaign.template?.html || renderMut.data?.html) ? (
            <div className="border border-border rounded-lg overflow-hidden bg-white shadow-sm" style={{ width: 620 }}>
              <iframe
                srcDoc={campaign.template?.html ?? renderMut.data?.html}
                className={`w-full transition-all duration-300 ${previewExpanded ? "h-[1200px]" : "h-[700px]"}`}
                title="Email preview"
                sandbox="allow-same-origin"
                style={{ pointerEvents: previewExpanded ? "auto" : "none" }}
              />
            </div>
          ) : renderMut.isPending ? (
            <div className="flex items-center justify-center py-16 w-full">
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin mr-2" />
              <span className="text-[11px] font-sans text-muted-foreground">Putting the preview together…</span>
            </div>
          ) : campaign.templateId ? (
            <Link
              href={`/templates/${campaign.templateId}/edit`}
              className="block p-8 bg-card rounded-lg border border-border hover:border-muted-foreground/50 transition-all text-center w-full max-w-md"
            >
              <Eye className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-[11px] text-muted-foreground">{campaign.template?.name ?? "Email Template"}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Open it to take a look or make changes</p>
            </Link>
          ) : (
            <div className="p-8 text-center w-full">
              <Mail className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-[10px] text-muted-foreground">No template attached yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
