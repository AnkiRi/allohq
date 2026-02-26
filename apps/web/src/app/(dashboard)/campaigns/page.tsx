"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Plus, Clock, Send, Check, XCircle, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";

const STATUS_CONFIG: Record<string, { icon: typeof Check; color: string; label: string }> = {
  draft: { icon: Clock, color: "text-muted-foreground", label: "Draft" },
  scheduled: { icon: Clock, color: "text-blue-500", label: "Scheduled" },
  sending: { icon: Send, color: "text-yellow-500", label: "Sending" },
  sent: { icon: Check, color: "text-green-500", label: "Sent" },
  cancelled: { icon: XCircle, color: "text-red-400", label: "Cancelled" },
};

export default function CampaignsPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const { data: campaigns, isLoading } = trpc.campaigns.list.useQuery(
    statusFilter ? { status: statusFilter as any } : undefined
  );

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
          <h1 className="text-[22px] tracking-[-0.5px] font-bold text-foreground font-mono">CAMPAIGNS</h1>
          <p className="text-[13px] text-muted-foreground font-mono mt-1">Create and manage email campaigns</p>
        </div>
        <Link
          href="/campaigns/new"
          className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono hover:bg-secondary/90 transition-all"
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
            className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
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
                  <h3 className="text-[13px] font-bold text-foreground font-mono truncate">{campaign.name}</h3>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                    {campaign.template.subject}
                  </p>
                </div>
                {campaign.segment && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded-lg">
                    <Users className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {campaign.segment.name} ({campaign.segment.customerCount})
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-4 text-right">
                  {campaign.status === "sent" && (
                    <div className="text-[11px] font-mono text-muted-foreground">
                      <span className="font-bold text-foreground">{campaign.recipientCount}</span> sent
                    </div>
                  )}
                  <div className={`flex items-center gap-1.5 ${statusCfg.color}`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-mono font-bold">{statusCfg.label}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 border border-border rounded-xl bg-card">
          <Mail className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-[13px] text-muted-foreground font-mono">No campaigns yet</p>
          <p className="text-[11px] text-muted-foreground/50 font-mono mt-1">Create your first email campaign</p>
        </div>
      )}
    </div>
  );
}
