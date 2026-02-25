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
        <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
        <span className="text-sm text-gray-400 font-mono">Loading campaign...</span>
      </div>
    );
  }

  if (!campaign) {
    return <div className="text-sm text-gray-400 font-mono">Campaign not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/campaigns" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 font-mono tracking-tight">{campaign.name}</h1>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{campaign.template.subject}</p>
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
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 disabled:opacity-50 transition-all"
            >
              {sendMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {sendMut.isPending ? "Sending..." : "Send Now"}
            </button>
          )}
          {campaign.status === "scheduled" && (
            <button
              onClick={() => cancelMut.mutate({ id: campaignId })}
              disabled={cancelMut.isPending}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 hover:border-gray-400 disabled:opacity-50 transition-all"
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
            className="border border-gray-200 rounded-xl p-5 bg-white hover:border-gray-900 hover:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all group"
          >
            <kpi.icon className="w-5 h-5 text-gray-300 mb-3 group-hover:text-gray-900 transition-colors" />
            <div className="text-xs text-gray-400 font-mono uppercase tracking-wider mb-1">{kpi.label}</div>
            <div className="text-xl font-bold text-gray-900 font-mono">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Campaign info */}
      <div className="grid grid-cols-2 gap-6">
        <div className="border border-gray-200 rounded-xl p-6 bg-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-px h-6 bg-gray-900" />
            <h2 className="text-sm font-bold text-gray-900 font-mono">DETAILS</h2>
          </div>
          <div className="space-y-3">
            {[
              { label: "Status", value: campaign.status.toUpperCase() },
              { label: "Template", value: campaign.template.name },
              { label: "Segment", value: campaign.segment?.name ?? "All Subscribers" },
              { label: "Store", value: campaign.store.shopDomain },
              { label: "Scheduled", value: campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString() : "—" },
              { label: "Sent At", value: campaign.sentAt ? new Date(campaign.sentAt).toLocaleString() : "—" },
            ].map((item) => (
              <div key={item.label} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-400 font-mono">{item.label}</span>
                <span className="text-xs font-bold text-gray-900 font-mono">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Template preview */}
        <div className="border border-gray-200 rounded-xl p-6 bg-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-px h-6 bg-gray-900" />
            <h2 className="text-sm font-bold text-gray-900 font-mono">TEMPLATE_PREVIEW</h2>
          </div>
          <Link
            href={`/templates/${campaign.templateId}/edit`}
            className="block p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-300 transition-all text-center"
          >
            <Mail className="w-6 h-6 text-gray-300 mx-auto mb-2" />
            <p className="text-xs font-mono text-gray-500">{campaign.template.name}</p>
            <p className="text-[10px] text-gray-400 font-mono mt-0.5">Click to edit template</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
