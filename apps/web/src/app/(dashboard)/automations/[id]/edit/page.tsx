"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { WorkflowEditor } from "@/components/workflow-editor/WorkflowEditor";
import { useToast } from "@/components/ui/Toast";

export default function EditAutomationPage() {
  const params = useParams();
  const router = useRouter();
  const automationId = params.id as string;
  const { toast } = useToast();

  const { data, isLoading } = (trpc.automations.getById as any).useQuery(
    { id: automationId },
  ) as { data: { id: string; name: string; description: string | null; triggerType: string; triggerConfig: unknown; nodes: unknown } | undefined; isLoading: boolean };

  const updateMut = (trpc.automations.update as any).useMutation({
    onSuccess: () => {
      toast("Saved.", "success");
      router.push(`/automations/${automationId}`);
    },
    onError: (err: { message?: string }) => toast(err.message || "We couldn't save that. Mind trying again?", "error"),
  }) as { mutateAsync: (input: Record<string, unknown>) => Promise<unknown>; isPending: boolean };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-[13px] text-muted-foreground font-sans py-20 text-center">
        We couldn't find this automation.
      </div>
    );
  }

  const initialNodes = Array.isArray(data.nodes) ? data.nodes as Array<{ id: string; type: any; config: Record<string, unknown> }> : [];

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/automations/${automationId}`} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-[18px] tracking-[-0.5px] font-semibold text-foreground font-serif">
              Edit: {data.name}
            </h1>
            {data.description && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{data.description}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 h-[calc(100%-3rem)]">
        <WorkflowEditor
          initialTriggerType={data.triggerType as any}
          initialTriggerConfig={data.triggerConfig as Record<string, unknown> || {}}
          initialNodes={initialNodes}
          saving={updateMut.isPending}
          onSave={async (triggerType, triggerConfig, nodes) => {
            await updateMut.mutateAsync({
              id: automationId,
              triggerType,
              triggerConfig,
              nodes,
            });
          }}
        />
      </div>
    </div>
  );
}
