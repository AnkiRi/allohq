"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  ChevronDown,
  ChevronRight,
  Bell,
  Zap,
} from "lucide-react";
import { cn } from "@allohq/ui";
import { trpc } from "../../lib/trpc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentAction = {
  id: string;
  agentType: string;
  actionType: string;
  input: unknown;
  output: unknown;
  status: string;
  createdAt: string;
};

type Observation = {
  id: string;
  type: string;
  severity: string;
  summary: string;
  data: unknown;
  acknowledged: boolean;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function actionLabel(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />;
    case "failed":
      return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    case "running":
      return <Clock className="w-3.5 h-3.5 text-amber-500 animate-spin" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function severityColor(severity: string) {
  switch (severity) {
    case "critical":
      return "border-red-500/30 bg-red-500/5";
    case "warning":
      return "border-amber-500/30 bg-amber-500/5";
    default:
      return "border-blue-500/30 bg-blue-500/5";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentCanvas() {
  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";
  const [tab, setTab] = useState<"actions" | "observations">("observations");
  const [expandedAction, setExpandedAction] = useState<string | null>(null);

  const { data: actions } = (trpc.ai as any).listAgentActions.useQuery(
    { storeId, limit: 30 },
    { enabled: !!storeId, refetchInterval: 30_000 }
  ) as { data: AgentAction[] | undefined };

  const { data: observations, refetch: refetchObs } = (trpc.ai as any).listObservations.useQuery(
    { storeId, unacknowledgedOnly: false },
    { enabled: !!storeId, refetchInterval: 30_000 }
  ) as { data: Observation[] | undefined; refetch: () => void };

  const ackMut = (trpc.ai as any).acknowledgeObservation.useMutation({
    onSuccess: () => refetchObs(),
  });

  const unacknowledgedCount = observations?.filter((o) => !o.acknowledged).length ?? 0;

  if (!storeId) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Zap className="w-4 h-4 text-[hsl(var(--accent))]" />
        <span className="font-semibold text-sm">Agent Canvas</span>
        {unacknowledgedCount > 0 && (
          <span className="ml-auto px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[10px] font-sans font-bold">
            {unacknowledgedCount} new
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          className={cn(
            "flex-1 py-2 text-xs font-sans uppercase tracking-wider text-center transition-colors",
            tab === "observations"
              ? "text-foreground border-b-2 border-[hsl(var(--accent))]"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setTab("observations")}
        >
          <Bell className="w-3 h-3 inline mr-1" />
          Alerts {unacknowledgedCount > 0 && `(${unacknowledgedCount})`}
        </button>
        <button
          className={cn(
            "flex-1 py-2 text-xs font-sans uppercase tracking-wider text-center transition-colors",
            tab === "actions"
              ? "text-foreground border-b-2 border-[hsl(var(--accent))]"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setTab("actions")}
        >
          <Activity className="w-3 h-3 inline mr-1" />
          Activity
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "observations" && (
          <div className="p-3 space-y-2">
            {!observations?.length && (
              <div className="text-center py-8 text-muted-foreground text-xs font-sans">
                Nothing to flag right now. joon keeps an eye on your store every 15 minutes.
              </div>
            )}
            {observations?.map((obs) => (
              <div
                key={obs.id}
                className={cn(
                  "rounded-lg border p-3 transition-all",
                  severityColor(obs.severity),
                  obs.acknowledged && "opacity-60"
                )}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className={cn(
                      "w-4 h-4 mt-0.5 flex-shrink-0",
                      obs.severity === "critical" ? "text-red-500" : "text-amber-500"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold">{obs.summary}</div>
                    <div className="text-[10px] font-sans text-muted-foreground mt-1">
                      {obs.type.replace(/_/g, " ")} · {timeAgo(obs.createdAt)}
                    </div>
                  </div>
                  {!obs.acknowledged && (
                    <button
                      onClick={() => ackMut.mutate({ observationId: obs.id })}
                      className="text-[10px] font-sans px-2 py-1 rounded bg-foreground/5 hover:bg-foreground/10 transition-colors"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "actions" && (
          <div className="p-3 space-y-1">
            {!actions?.length && (
              <div className="text-center py-8 text-muted-foreground text-xs font-sans">
                Nothing here yet. joon&apos;s work will show up as it happens.
              </div>
            )}
            {actions?.map((action) => (
              <div key={action.id} className="rounded-lg border border-border p-2.5">
                <button
                  className="flex items-center gap-2 w-full text-left"
                  onClick={() =>
                    setExpandedAction(expandedAction === action.id ? null : action.id)
                  }
                >
                  {statusIcon(action.status)}
                  <span className="text-xs font-medium flex-1">
                    {actionLabel(action.actionType)}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {timeAgo(action.createdAt)}
                  </span>
                  {expandedAction === action.id ? (
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  )}
                </button>
                {expandedAction === action.id && (
                  <div className="mt-2 pl-6 text-[11px] font-sans text-muted-foreground space-y-1">
                    <div>Agent: {action.agentType.replace(/_/g, " ")}</div>
                    <div>Status: {action.status}</div>
                    {action.input != null && (
                      <pre className="bg-foreground/5 rounded p-1.5 text-[10px] font-mono overflow-x-auto max-h-24">
                        {JSON.stringify(action.input, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
