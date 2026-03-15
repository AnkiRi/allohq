"use client";

import { useParams } from "next/navigation";
import { ArrowLeft, Send, Mail, Users, MousePointerClick, XCircle, CheckCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as string;
  const { toast } = useToast();

  const { data: campaign, isLoading } = trpc.campaigns.getById.useQuery({ id: campaignId });
  const { data: stats } = trpc.campaigns.stats.useQuery({ id: campaignId });
  const utils = trpc.useUtils();
  const sendMut = trpc.campaigns.sendNow.useMutation({
    onSuccess: () => {
      utils.campaigns.getById.invalidate({ id: campaignId });
      utils.campaigns.stats.invalidate({ id: campaignId });
      toast("Campaign sent!", "success");
    },
    onError: () => toast("Failed to send campaign", "error"),
  });
  const cancelMut = trpc.campaigns.cancel.useMutation({
    onSuccess: () => {
      utils.campaigns.getById.invalidate({ id: campaignId });
      toast("Campaign cancelled", "info");
    },
    onError: () => toast("Failed to cancel campaign", "error"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2">
        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        <span className="text-[13px] text-muted-foreground font-mono">Loading campaign...</span>
      </div>
    );
  }

  if (!campaign) {
    return <div className="text-[13px] text-muted-foreground font-mono">Campaign not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/campaigns" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-[18px] tracking-[-0.5px] font-bold text-foreground font-mono">{campaign.name}</h1>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{campaign.template?.subject}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === "sent" && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-mono font-bold">
              <CheckCircle className="w-3.5 h-3.5" />
              Sent
            </span>
          )}
          {campaign.status === "sending" && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-mono font-bold">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Sending...
            </span>
          )}
          {(campaign.status === "draft" || campaign.status === "scheduled") && (
            <button
              onClick={() => sendMut.mutate({ id: campaignId })}
              disabled={sendMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono hover:bg-secondary/90 disabled:opacity-50 transition-all"
            >
              {sendMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {sendMut.isPending ? "Sending..." : "Send Now"}
            </button>
          )}
          {campaign.status === "scheduled" && (
            <button
              onClick={() => cancelMut.mutate({ id: campaignId })}
              disabled={cancelMut.isPending}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-xs font-mono text-foreground hover:border-primary/50 disabled:opacity-50 transition-all"
            >
              <XCircle className="w-3.5 h-3.5" />
              {cancelMut.isPending ? "Cancelling..." : "Cancel"}
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
            <div className="text-[10px] text-muted-foreground font-mono uppercase font-bold tracking-[1px] mb-1">{kpi.label}</div>
            <div className="text-[28px] tabular-nums font-bold text-foreground font-mono">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Campaign info */}
      <div className="grid grid-cols-2 gap-6">
        <div className="border border-border rounded-xl p-6 bg-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-px h-6 bg-secondary" />
            <h2 className="text-[13px] font-bold text-foreground font-mono">DETAILS</h2>
          </div>
          <div className="space-y-3">
            {[
              { label: "Status", value: campaign.status.toUpperCase() },
              { label: "Template", value: campaign.template?.name },
              { label: "Segment", value: campaign.segment?.name ?? "All Subscribers" },
              { label: "Store", value: campaign.store.shopDomain },
              { label: "Scheduled", value: campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString() : "\u2014" },
              { label: "Sent At", value: campaign.sentAt ? new Date(campaign.sentAt).toLocaleString() : "\u2014" },
            ].map((item) => (
              <div key={item.label} className="flex justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-[11px] text-muted-foreground font-mono">{item.label}</span>
                <span className="text-[11px] font-bold text-foreground font-mono">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Template preview */}
        <div className="border border-border rounded-xl p-6 bg-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-px h-6 bg-secondary" />
              <h2 className="text-[13px] font-bold text-foreground font-mono">TEMPLATE_PREVIEW</h2>
            </div>
            <Link
              href={`/templates/${campaign.templateId}/edit`}
              className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              Edit template &rarr;
            </Link>
          </div>
          {campaign.template?.html ? (
            <div className="border border-border rounded-lg overflow-hidden bg-white">
              <iframe
                srcDoc={campaign.template?.html}
                className="w-full h-[400px] pointer-events-none"
                title="Email preview"
                sandbox=""
              />
            </div>
          ) : ((campaign.template as any).blocks as any[])?.length > 0 ? (
            <div className="p-4 bg-muted rounded-lg border border-border space-y-3">
              {((campaign.template as any).blocks as Array<{ type: string; props?: Record<string, unknown> }>).map((block, i) => (
                <div key={i} className="text-[11px] font-mono text-foreground">
                  {block.type === "heading" && <h3 className="text-sm font-bold">{block.props?.text as string}</h3>}
                  {block.type === "text" && <p className="text-muted-foreground">{block.props?.text as string}</p>}
                  {block.type === "button" && (
                    <span className="inline-block px-3 py-1 bg-foreground text-background rounded text-[10px]">{block.props?.text as string}</span>
                  )}
                  {block.type === "product" && (
                    <div className="flex items-center gap-2 p-2 border border-border rounded">
                      <Mail className="w-4 h-4 text-muted-foreground/50" />
                      <span>{block.props?.title as string} — ${String(block.props?.price ?? "")}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Link
              href={`/templates/${campaign.templateId}/edit`}
              className="block p-4 bg-muted rounded-lg border border-border hover:border-muted-foreground/50 transition-all text-center"
            >
              <Mail className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-[11px] font-mono text-muted-foreground">{campaign.template?.name}</p>
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">No content yet — click to edit</p>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
