"use client";

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  ChevronDown,
  AlertTriangle,
  TrendingUp,
  Eye,
  Filter,
  Pencil,
  X,
  Trash2,
  ArrowRight,
  Info,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const STATUS_OPTIONS = [
  { value: undefined, label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "executed", label: "Executed" },
  { value: "auto_executed", label: "Auto-Executed" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
] as const;

function getUrgencyColor(score: number): string {
  if (score >= 80) return "text-red-600 bg-red-50";
  if (score >= 50) return "text-amber-600 bg-amber-50";
  return "text-emerald-600 bg-emerald-50";
}

function getConfidenceBadge(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "High", color: "bg-emerald-100 text-emerald-700" };
  if (score >= 50) return { label: "Medium", color: "bg-amber-100 text-amber-700" };
  return { label: "Low", color: "bg-red-100 text-red-700" };
}

function formatRevenue(value: number | null | undefined): string {
  if (!value) return "--";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function timeUntilExpiry(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

const TYPE_OPTIONS = [
  { value: undefined, label: "All Types" },
  { value: "campaign", label: "Campaign" },
  { value: "automation", label: "Automation" },
  { value: "discount", label: "Discount" },
] as const;

function getStatusBanner(status: string | undefined): { text: string; color: string } | null {
  switch (status) {
    case "pending":
      return { text: "Approve actions to create campaigns or activate automations. Reject to dismiss.", color: "bg-blue-50 text-blue-700 border-blue-200" };
    case "approved":
    case "executed":
      return { text: "These actions have been executed. View results in Campaigns or Automations.", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "rejected":
      return { text: "Dismissed actions. These won't be executed.", color: "bg-gray-50 text-gray-600 border-gray-200" };
    case "auto_executed":
      return { text: "These actions were automatically executed by the AI agent based on your autonomy settings.", color: "bg-blue-50 text-blue-700 border-blue-200" };
    case "expired":
      return { text: "Expired actions — the opportunity window has passed.", color: "bg-amber-50 text-amber-700 border-amber-200" };
    default:
      return null;
  }
}

function getEmptyState(status: string | undefined): { title: string; description: string } {
  switch (status) {
    case "pending":
      return { title: "No pending actions", description: "All caught up! Allo will propose new campaigns and automations as opportunities arise." };
    case "approved":
    case "executed":
      return { title: "No executed actions", description: "Approve pending actions to create campaigns or activate automations." };
    case "rejected":
      return { title: "No rejected actions", description: "Actions you dismiss or reject will appear here." };
    case "auto_executed":
      return { title: "No auto-executed actions", description: "When the AI agent has enough confidence, it will execute actions autonomously. They'll appear here." };
    case "expired":
      return { title: "No expired actions", description: "Actions that weren't reviewed in time appear here." };
    default:
      return { title: "No actions yet", description: "Allo will queue opportunities as it analyzes your store data." };
  }
}

export default function ActionsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";

  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = (trpc as any).autonomy.listActions.useQuery(
    { storeId, status: statusFilter, limit: 50 },
    { enabled: !!storeId },
  ) as { data: { actions: any[]; total: number } | undefined; isLoading: boolean };

  const utils = trpc.useUtils();

  const approveMut = (trpc as any).autonomy.approveAction.useMutation({
    onSuccess: (result: { executedType?: string }) => {
      const msg = result.executedType === "campaign"
        ? "Action approved — campaign created! Check Campaigns tab."
        : result.executedType === "automation"
        ? "Action approved — automation activated!"
        : "Action approved!";
      toast(msg, "success");
      (utils as any).autonomy.listActions.invalidate({ storeId });
    },
    onError: (err: { message?: string }) => toast(err.message || "Failed", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const rejectMut = (trpc as any).autonomy.rejectAction.useMutation({
    onSuccess: () => {
      toast("Action rejected", "success");
      (utils as any).autonomy.listActions.invalidate({ storeId });
    },
    onError: (err: { message?: string }) => toast(err.message || "Failed", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const dismissMut = (trpc as any).autonomy.rejectAction.useMutation({
    onSuccess: () => {
      toast("Action dismissed", "success");
      (utils as any).autonomy.listActions.invalidate({ storeId });
    },
    onError: (err: { message?: string }) => toast(err.message || "Failed", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const bulkApproveMut = (trpc as any).autonomy.bulkApprove.useMutation({
    onSuccess: (result: { approved: number }) => {
      toast(`${result.approved} actions approved & executed!`, "success");
      (utils as any).autonomy.listActions.invalidate({ storeId });
    },
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const bulkRejectMut = (trpc as any).autonomy.bulkReject.useMutation({
    onSuccess: (result: { rejected: number }) => {
      toast(`${result.rejected} actions cleared`, "success");
      (utils as any).autonomy.listActions.invalidate({ storeId });
    },
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const allActions = data?.actions ?? [];
  const actions = typeFilter
    ? allActions.filter((a: any) => a.category === typeFilter || a.type?.includes(typeFilter))
    : allActions;
  const pendingActions = actions.filter((a: any) => a.status === "pending");

  const banner = getStatusBanner(statusFilter);
  const empty = getEmptyState(statusFilter);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-5xl mx-auto space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="section-header accent-bar-left text-[22px] font-semibold text-foreground font-serif">
            Action queue
          </h1>
          <p className="text-sm text-[#8B8074] mt-1">
            Review AI-proposed campaigns and actions — approve to execute, reject to dismiss
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingActions.length > 1 && (
            <>
              <button
                onClick={() => bulkRejectMut.mutate({
                  actionIds: pendingActions.map((a: any) => a.id),
                  reason: "Cleared by merchant",
                })}
                className="flex items-center gap-1.5 px-4 py-2 border border-[#EDE7DB] text-[#8B8074] text-sm rounded-lg hover:bg-[#EDE7DB]/40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All ({pendingActions.length})
              </button>
              <button
                onClick={() => bulkApproveMut.mutate({ actionIds: pendingActions.map((a: any) => a.id) })}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#2C2C2C] text-white text-sm rounded-lg hover:bg-[#1a1a1a] transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                Approve All ({pendingActions.length})
              </button>
            </>
          )}
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-[#8B8074]" />
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
              statusFilter === opt.value
                ? "bg-[#2C2C2C] text-white"
                : "bg-[#EDE7DB]/60 text-[#5C5549] hover:bg-[#EDE7DB]"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="ml-2 text-xs text-[#8B8074]">|</span>
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            onClick={() => setTypeFilter(opt.value)}
            className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
              typeFilter === opt.value
                ? "bg-[#2C2C2C] text-white"
                : "bg-[#EDE7DB]/60 text-[#5C5549] hover:bg-[#EDE7DB]"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-[#8B8074]">
          {data?.total ?? 0} total
        </span>
      </motion.div>

      {/* Contextual banner */}
      {banner && (
        <motion.div
          variants={itemVariants}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-xs ${banner.color}`}
        >
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          {banner.text}
        </motion.div>
      )}

      {/* Loading */}
      {isLoading && (
        <motion.div variants={itemVariants} className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-skeleton h-40 rounded-xl" />
          ))}
        </motion.div>
      )}

      {/* Empty state */}
      {!isLoading && actions.length === 0 && (
        <motion.div
          variants={itemVariants}
          className="glass-card-static rounded-xl p-12 text-center"
        >
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-[#2C2C2C]">{empty.title}</h3>
          <p className="text-sm text-[#8B8074] mt-1">{empty.description}</p>
        </motion.div>
      )}

      {/* Action cards */}
      {actions.map((action: any) => {
        const confidence = getConfidenceBadge(action.confidenceScore ?? 0);
        const urgencyColor = getUrgencyColor(action.urgencyScore ?? 0);
        const expiry = timeUntilExpiry(action.expiresAt);
        const isExpanded = expandedId === action.id;
        const isExecuted = action.status === "approved" || action.status === "executed" || action.status === "auto_executed";

        return (
          <motion.div
            key={action.id}
            variants={itemVariants}
            className="glass-card-static rounded-xl overflow-hidden"
          >
            {/* Card header */}
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-[#8B8074]">
                      {action.category?.replace(/_/g, " ")}
                    </span>
                    {action.archetype && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">
                        {action.archetype}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${confidence.color}`}>
                      {confidence.label} confidence
                    </span>
                    {action.type && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#EDE7DB]/60 text-[#5C5549]">
                        {action.type === "campaign_send" ? "Campaign" : action.type === "automation_draft" ? "Automation" : action.type}
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-[#2C2C2C]">
                    {action.campaignName || action.reasoning?.substring(0, 80) || action.type}
                  </h3>
                  {action.reasoning && action.campaignName && (
                    <p className="text-sm text-[#5C5549] mt-1 line-clamp-2">
                      {action.reasoning}
                    </p>
                  )}
                </div>

                {/* Metrics column */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {action.estimatedRevenue != null && (
                    <div className="flex items-center gap-1 text-sm">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="font-medium text-[#2C2C2C]">
                        {formatRevenue(action.estimatedRevenue)}
                      </span>
                    </div>
                  )}
                  {action.targetSegment && (
                    <span className="text-xs text-[#8B8074]">
                      {action.targetSegment.count?.toLocaleString()} customers
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${urgencyColor}`}>
                      <AlertTriangle className="w-3 h-3 inline mr-0.5" />
                      {action.urgencyScore}
                    </span>
                    {expiry && (
                      <span className="text-xs text-[#8B8074] flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {expiry}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview toggle + Actions */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#EDE7DB]/60">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : action.id)}
                    className="flex items-center gap-1 text-xs text-[#8B8074] hover:text-[#5C5549] transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {isExpanded ? "Hide preview" : "Show preview"}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>

                  {/* Link to result for executed actions */}
                  {isExecuted && action.type === "campaign_send" && (
                    <button
                      onClick={() => router.push("/campaigns")}
                      className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 transition-colors"
                    >
                      View in Campaigns
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                  {isExecuted && action.type === "automation_draft" && (
                    <button
                      onClick={() => router.push("/automations")}
                      className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 transition-colors"
                    >
                      View in Automations
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {action.status === "pending" && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => dismissMut.mutate({ actionId: action.id, reason: "Dismissed" })}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-[#EDE7DB] text-[#8B8074] hover:bg-[#EDE7DB]/40 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Dismiss
                    </button>
                    {action.campaignId && (
                      <button
                        onClick={() => router.push(`/campaigns/${action.campaignId}/edit`)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-[#EDE7DB] text-[#5C5549] hover:bg-[#EDE7DB]/40 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => rejectMut.mutate({ actionId: action.id, reason: "Rejected by merchant" })}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject
                    </button>
                    <button
                      onClick={() => approveMut.mutate({ actionId: action.id })}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Approve
                    </button>
                  </div>
                )}
                {action.status !== "pending" && (
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    action.status === "approved" || action.status === "executed" ? "bg-emerald-50 text-emerald-600" :
                    action.status === "rejected" ? "bg-red-50 text-red-600" :
                    action.status === "auto_executed" ? "bg-blue-50 text-blue-600" :
                    "bg-gray-100 text-gray-500"
                  }`}>
                    {action.status === "auto_executed" ? "Auto-executed" : action.status}
                  </span>
                )}
              </div>
            </div>

            {/* Expanded preview */}
            {isExpanded && action.htmlPreview && (
              <div className="border-t border-[#EDE7DB]/60 p-4 bg-white/40">
                <div
                  className="rounded-lg border border-[#EDE7DB] overflow-hidden max-h-[400px] overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: action.htmlPreview }}
                />
              </div>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
