"use client";

import { useState } from "react";
import Link from "next/link";
import {
  GitBranch,
  Plus,
  Play,
  Pause,
  Copy,
  Trash2,
  Calendar,
  Zap,
  Clock,
  Users,
  LogOut,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

type WorkflowItem = {
  id: string;
  name: string;
  description: string | null;
  triggerType: "event" | "schedule" | "segment_entry" | "segment_exit";
  status: "draft" | "active" | "paused" | "archived";
  nodeCount: number;
  createdAt: string;
};

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: "bg-gray-100", text: "text-gray-500", label: "Draft" },
  active: { bg: "bg-green-50", text: "text-green-600", label: "Active" },
  paused: { bg: "bg-yellow-50", text: "text-yellow-600", label: "Paused" },
  archived: { bg: "bg-red-50", text: "text-red-500", label: "Archived" },
};

const TRIGGER_CONFIG: Record<string, { icon: typeof Zap; label: string }> = {
  event: { icon: Zap, label: "Event" },
  schedule: { icon: Clock, label: "Schedule" },
  segment_entry: { icon: Users, label: "Segment Entry" },
  segment_exit: { icon: LogOut, label: "Segment Exit" },
};

export default function WorkflowsPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const { toast } = useToast();

  const { data: workflows, isLoading } = trpc.workflows.list.useQuery() as {
    data: WorkflowItem[] | undefined;
    isLoading: boolean;
  };

  const utils = trpc.useUtils();

  const duplicateMut = trpc.workflows.duplicate.useMutation({
    onSuccess: () => {
      utils.workflows.list.invalidate();
      toast("Workflow duplicated", "success");
    },
    onError: () => toast("Failed to duplicate workflow", "error"),
  });

  const deleteMut = trpc.workflows.delete.useMutation({
    onSuccess: () => {
      utils.workflows.list.invalidate();
      toast("Workflow deleted", "success");
    },
    onError: () => toast("Failed to delete workflow", "error"),
  });

  const activateMut = trpc.workflows.activate.useMutation({
    onSuccess: () => {
      utils.workflows.list.invalidate();
      toast("Workflow activated", "success");
    },
    onError: () => toast("Failed to activate workflow", "error"),
  });

  const pauseMut = trpc.workflows.pause.useMutation({
    onSuccess: () => {
      utils.workflows.list.invalidate();
      toast("Workflow paused", "success");
    },
    onError: () => toast("Failed to pause workflow", "error"),
  });

  const statuses = [
    { value: undefined, label: "All" },
    { value: "draft", label: "Draft" },
    { value: "active", label: "Active" },
    { value: "paused", label: "Paused" },
  ];

  const filteredWorkflows = workflows?.filter(
    (w) => !statusFilter || w.status === statusFilter
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">
            WORKFLOWS
          </h1>
          <p className="text-sm text-gray-400 font-mono mt-1">
            Build and manage automated workflows
          </p>
        </div>
        <Link
          href="/workflows/new"
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          New Workflow
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
                ? "bg-gray-900 text-white"
                : "bg-white border border-gray-200 text-gray-500 hover:border-gray-400"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Workflow list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredWorkflows && filteredWorkflows.length > 0 ? (
        <div className="space-y-3">
          {filteredWorkflows.map((workflow) => {
            const badge = STATUS_BADGES[workflow.status] ?? STATUS_BADGES["draft"]!;
            const trigger = TRIGGER_CONFIG[workflow.triggerType] ?? TRIGGER_CONFIG["event"]!;
            const TriggerIcon = trigger.icon;
            return (
              <div
                key={workflow.id}
                className="flex items-center gap-4 p-4 border border-gray-200 rounded-xl bg-white hover:border-gray-900 hover:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center">
                  <GitBranch className="w-4 h-4 text-gray-400" />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-gray-900 font-mono truncate">
                    {workflow.name}
                  </h3>
                  {workflow.description && (
                    <p className="text-xs text-gray-400 font-mono truncate mt-0.5">
                      {workflow.description}
                    </p>
                  )}
                </div>

                {/* Trigger badge */}
                <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-lg">
                  <TriggerIcon className="w-3 h-3 text-gray-400" />
                  <span className="text-xs font-mono text-gray-500">{trigger.label}</span>
                </div>

                {/* Node count */}
                <div className="text-xs font-mono text-gray-500">
                  <span className="font-bold text-gray-900">{workflow.nodeCount}</span> nodes
                </div>

                {/* Status badge */}
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold ${badge.bg} ${badge.text}`}
                >
                  {badge.label}
                </span>

                {/* Created date */}
                <div className="flex items-center gap-1 text-xs text-gray-400 font-mono">
                  <Calendar className="w-3 h-3" />
                  {new Date(workflow.createdAt).toLocaleDateString()}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Link
                    href={`/workflows/${workflow.id}`}
                    className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 hover:border-gray-400 transition-all"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateMut.mutate({ id: workflow.id });
                    }}
                    disabled={duplicateMut.isPending}
                    className="p-1.5 border border-gray-200 rounded-lg text-gray-400 hover:border-gray-400 hover:text-gray-700 transition-all disabled:opacity-50"
                    title="Duplicate"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {workflow.status === "active" ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        pauseMut.mutate({ id: workflow.id });
                      }}
                      disabled={pauseMut.isPending}
                      className="p-1.5 border border-gray-200 rounded-lg text-yellow-500 hover:border-yellow-400 transition-all disabled:opacity-50"
                      title="Pause"
                    >
                      <Pause className="w-3.5 h-3.5" />
                    </button>
                  ) : workflow.status !== "archived" ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        activateMut.mutate({ id: workflow.id });
                      }}
                      disabled={activateMut.isPending}
                      className="p-1.5 border border-gray-200 rounded-lg text-green-500 hover:border-green-400 transition-all disabled:opacity-50"
                      title="Activate"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this workflow?")) {
                        deleteMut.mutate({ id: workflow.id });
                      }
                    }}
                    disabled={deleteMut.isPending}
                    className="p-1.5 border border-gray-200 rounded-lg text-gray-400 hover:border-red-300 hover:text-red-500 transition-all disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 border border-gray-200 rounded-xl bg-white">
          <GitBranch className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400 font-mono">No workflows yet</p>
          <p className="text-xs text-gray-300 font-mono mt-1">
            Create your first automated workflow
          </p>
        </div>
      )}
    </div>
  );
}
