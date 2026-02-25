"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { WorkflowEditor } from "@/components/workflow-editor/WorkflowEditor";

type TriggerType = "event" | "schedule" | "segment_entry" | "segment_exit";

export default function NewWorkflowPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("Untitled Workflow");
  const createMut = trpc.workflows.create.useMutation();

  async function handleSave(triggerType: TriggerType, triggerConfig: Record<string, unknown>, nodes: unknown[]) {
    const workflow = await createMut.mutateAsync({
      name,
      triggerType,
      triggerConfig,
      nodes: nodes as any,
    });
    toast("Workflow created!", "success");
    router.push(`/workflows/${workflow.id}`);
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
      </div>
      <div className="flex-1 min-h-0">
        <WorkflowEditor onSave={handleSave} saving={createMut.isPending} />
      </div>
    </div>
  );
}
