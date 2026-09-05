"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { ArrowLeft, Send, Mail, Users, MousePointerClick, XCircle, CheckCircle, Loader2, Eye, Maximize2, Minimize2, Trash2 } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { DecisionTracePanel } from "@/components/campaigns/DecisionTracePanel";

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;
  const { toast } = useToast();

  const [previewExpanded, setPreviewExpanded] = useState(false);
  const { data: campaign, isLoading } = trpc.campaigns.getById.useQuery({ id: campaignId });
  const { data: stats } = trpc.campaigns.stats.useQuery({ id: campaignId });
  const { data: dryRun, isLoading: dryRunLoading } = trpc.campaigns.dryRun.useQuery(
    { id: campaignId },
    { enabled: campaign?.status === "draft" || campaign?.status === "scheduled" },
  );

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
  const deleteMut = trpc.campaigns.delete.useMutation({
    onSuccess: () => {
      utils.campaigns.list.invalidate();
      toast("Draft deleted.", "info");
      router.push("/campaigns");
    },
    onError: () => toast("We couldn't delete that. Mind trying again?", "error"),
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
          {campaign.status === "draft" && (
            <button
              onClick={() => {
                if (window.confirm(`Delete the draft "${campaign.name}"? This can't be undone.`)) {
                  deleteMut.mutate({ id: campaignId });
                }
              }}
              disabled={deleteMut.isPending}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-xs font-sans text-muted-foreground hover:border-[var(--color-urgent)] hover:text-[var(--color-urgent)] disabled:opacity-50 transition-all"
            >
              {deleteMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {deleteMut.isPending ? "Deleting…" : "Delete"}
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

      {(campaign.status === "draft" || campaign.status === "scheduled") && (
        <div className="border border-border rounded-xl p-6 bg-card">
          <div className="flex items-start justify-between gap-6 mb-5">
            <div>
              <p className="text-[10px] uppercase tracking-[1px] font-bold text-muted-foreground">Pre-send safety check</p>
              <h2 className="text-[16px] font-semibold font-serif mt-1">Who will actually receive this</h2>
              <p className="text-[11px] text-muted-foreground mt-1">A dry run only. No email provider has been called.</p>
            </div>
            {dryRunLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          {dryRun && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  ["Requested", dryRun.requested],
                  ["Treatment estimate", dryRun.estimatedTreatment],
                  ["Held out estimate", dryRun.estimatedControl],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg bg-muted/50 px-4 py-3">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
                    <div className="text-xl font-mono font-bold mt-1">{Number(value).toLocaleString()}</div>
                  </div>
                ))}
              </div>
              {dryRun.measurement.warning && (
                <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    {dryRun.measurement.tier === "unmeasured" ? "Unmeasured small cohort" : "Directional measurement"}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{dryRun.measurement.warning}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                {Object.entries(dryRun.exclusions).filter(([, count]) => count > 0).map(([reason, count]) => (
                  <div key={reason} className="flex justify-between py-2 border-b border-border text-[11px]">
                    <span className="text-muted-foreground">{reason.replaceAll("_", " ")}</span>
                    <span className="font-mono font-bold">-{count}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-border flex justify-between text-[11px]">
                <span className="text-muted-foreground">Sender</span>
                <span className="font-medium">
                  {dryRun.sender ?? "Sending address not configured"} · {dryRun.senderDomain?.status ?? "domain not configured"}
                </span>
              </div>
              <div className="mt-2 flex justify-between text-[11px]">
                <span className="text-muted-foreground">Estimated provider cost</span>
                <span className="font-medium">{dryRun.estimatedProviderCostCurrency} {dryRun.estimatedProviderCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">The eligible customer set and complete treatment/control assignment freeze when you approve. Consent, suppression, pauses and delivery limits are checked again immediately before every email.</p>
              {dryRun.marginRisk.discountPercent > 0 && dryRun.marginRisk.recentBuyers > 0 && (
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">Margin worth reviewing</div>
                  <p className="mt-1 text-[13px] font-medium">
                    {dryRun.marginRisk.recentBuyers} currently eligible {dryRun.marginRisk.recentBuyers === 1 ? "customer has" : "customers have"} already purchased in the last 7 days.
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    They placed {dryRun.marginRisk.recentOrders} orders worth {dryRun.currency} {dryRun.marginRisk.observedRecentSubtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}. If equivalent baskets used this {dryRun.marginRisk.discountPercent}% offer, discount exposure would be about {dryRun.currency} {dryRun.marginRisk.illustrativeDiscountExposure.toLocaleString(undefined, { maximumFractionDigits: 2 })}.
                  </p>
                  <p className="mt-2 text-[10px] text-muted-foreground">This is an illustration from observed orders—not a prediction that these customers will purchase again.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

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
