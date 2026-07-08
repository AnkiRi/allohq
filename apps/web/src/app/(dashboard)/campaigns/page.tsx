"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Plus, Clock, Send, Check, XCircle, Users, DollarSign, MousePointerClick, Eye, Trash2, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { SmartEmptyState } from "@/components/ui/SmartEmptyState";

const STATUS_CONFIG: Record<string, { icon: typeof Check; color: string; label: string }> = {
  draft: { icon: Clock, color: "text-muted-foreground", label: "Draft" },
  scheduled: { icon: Clock, color: "text-[var(--color-warning)]", label: "Scheduled" },
  sending: { icon: Send, color: "text-[var(--color-warning)]", label: "Sending" },
  sent: { icon: Check, color: "text-[var(--color-success)]", label: "Sent" },
  cancelled: { icon: XCircle, color: "text-[var(--color-urgent)]", label: "Cancelled" },
};

export default function CampaignsPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  // Cast breaks a TS2589 "excessively deep" instantiation on the tRPC list result (the
  // AppRouter type is large); matches the (trpc.X as any).useQuery pattern used elsewhere.
  const { data: campaigns, isLoading } = (trpc.campaigns.list as any).useQuery(
    statusFilter ? { status: statusFilter as any } : undefined
  ) as { data: any[] | undefined; isLoading: boolean };
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const deleteMut = (trpc.campaigns.delete as any).useMutation({
    onSuccess: () => {
      utils.campaigns.list.invalidate();
      toast("Draft deleted.", "info");
    },
    onError: () => toast("We couldn't delete that. Mind trying again?", "error"),
  }) as { mutate: (v: { id: string }) => void; isPending: boolean; variables?: { id: string } };

  const statuses = [
    { value: undefined, label: "All" },
    { value: "draft", label: "Drafts" },
    { value: "scheduled", label: "Scheduled" },
    { value: "sent", label: "Sent" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">Campaigns</h1>
          <p className="text-[13px] text-muted-foreground font-sans mt-1">
            {campaigns ? `${campaigns.filter((c: any) => c.status === "draft").length} drafts, ${campaigns.filter((c: any) => c.status === "sent").length} sent` : "Your email campaigns, start to finish"}
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-sans hover:bg-secondary/90 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          New Campaign
        </Link>
      </div>

      {/* Status filters */}
      <div className="flex gap-2">
        {statuses.map((s) => (
          <button
            key={s.label}
            onClick={() => setStatusFilter(s.value)}
            className={`px-3 py-1.5 text-xs font-sans rounded-lg transition-all ${
              statusFilter === s.value
                ? "bg-secondary text-secondary-foreground"
                : "bg-card border border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Campaign list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : campaigns && campaigns.length > 0 ? (
        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const statusCfg = STATUS_CONFIG[campaign.status] ?? STATUS_CONFIG["draft"]!;
            const StatusIcon = statusCfg.icon;
            return (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="flex items-center gap-4 p-4 border border-border rounded-xl bg-card hover:border-foreground hover:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[13px] font-bold text-foreground font-sans truncate">{campaign.name}</h3>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {campaign.template?.subject ?? "No subject"}
                  </p>
                </div>
                {campaign.segment && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded-lg">
                    <Users className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[11px] font-sans text-muted-foreground">
                      {campaign.segment.name} ({campaign.segment.customerCount})
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-4 text-right">
                  {campaign.status === "sent" && (
                    <>
                      <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground">
                        <span>
                          <span className="font-bold text-foreground">{campaign.recipientCount}</span> sent
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Eye className="w-3 h-3" />
                          {(campaign.openRate * 100).toFixed(1)}%
                        </span>
                        <span className="flex items-center gap-0.5">
                          <MousePointerClick className="w-3 h-3" />
                          {(campaign.clickRate * 100).toFixed(1)}%
                        </span>
                      </div>
                      {campaign.attributedRevenue > 0 && (
                        <div className="flex items-center gap-0.5 text-[11px] font-mono text-[hsl(var(--success))]">
                          <DollarSign className="w-3 h-3" />
                          <span className="font-bold">
                            {campaign.attributedRevenue.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                          <span className="text-muted-foreground ml-1">
                            ({campaign.attributedOrders} orders)
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  <div className={`flex items-center gap-1.5 ${statusCfg.color}`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-sans font-bold">{statusCfg.label}</span>
                  </div>
                  {campaign.status === "draft" && (
                    <button
                      aria-label="Delete draft"
                      title="Delete draft"
                      onClick={(e) => {
                        // Inside the row Link — stop navigation before confirming.
                        e.preventDefault();
                        e.stopPropagation();
                        if (window.confirm(`Delete the draft "${campaign.name}"? This can't be undone.`)) {
                          deleteMut.mutate({ id: campaign.id });
                        }
                      }}
                      disabled={deleteMut.isPending && deleteMut.variables?.id === campaign.id}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-[var(--color-urgent)] hover:bg-[var(--color-urgent)]/10 disabled:opacity-50 transition-all"
                    >
                      {deleteMut.isPending && deleteMut.variables?.id === campaign.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <SmartEmptyState
          icon={Mail}
          title="No campaigns yet. Want joon to draft one?"
          description="joon has spotted a few moments worth reaching out about."
          actions={[{ label: "Create a campaign", href: "/campaigns/new", primary: true }]}
        />
      )}
    </div>
  );
}
