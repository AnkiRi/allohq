"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { WorkflowEditor } from "@/components/workflow-editor/WorkflowEditor";

type TriggerType = "event" | "schedule" | "segment_entry" | "segment_exit";

export default function WorkflowDetailPage() {
  const params = useParams();
  const workflowId = params.id as string;
  const { toast } = useToast();

  const { data: workflow, isLoading } = trpc.workflows.getById.useQuery({ id: workflowId }) as {
    data: { id: string; name: string; description: string | null; triggerType: string; triggerConfig: unknown; nodes: unknown; status: string } | undefined;
    isLoading: boolean;
  };
  const updateMut = trpc.workflows.update.useMutation();
  const [name, setName] = useState("");

  useEffect(() => {
    if (workflow) setName(workflow.name);
  }, [workflow]);

  async function handleSave(triggerType: TriggerType, triggerConfig: Record<string, unknown>, nodes: unknown[]) {
    await updateMut.mutateAsync({
      id: workflowId,
      name,
      triggerType,
      triggerConfig,
      nodes: nodes as any,
    });
    toast("Workflow saved!", "success");
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (!workflow) {
    return <div className="text-sm text-gray-400 font-mono text-center py-20">Workflow not found</div>;
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center gap-4">
        <Link href="/workflows" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </Link>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-lg font-bold text-gray-900 font-mono bg-transparent border-none outline-none"
          placeholder="Workflow name..."
        />
        <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full ${
          workflow.status === "active" ? "bg-green-100 text-green-700" :
          workflow.status === "paused" ? "bg-yellow-100 text-yellow-700" :
          "bg-gray-100 text-gray-500"
        }`}>
          {workflow.status.toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <WorkflowEditor
          initialTriggerType={workflow.triggerType as TriggerType}
          initialTriggerConfig={workflow.triggerConfig as Record<string, unknown>}
          initialNodes={workflow.nodes as any[]}
          onSave={handleSave}
          saving={updateMut.isPending}
        />
      </div>
    </div>
  );
}
