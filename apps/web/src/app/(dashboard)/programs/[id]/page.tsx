"use client";

import { useParams } from "next/navigation";
import { ArrowLeft, FileText, Sparkles, Play, ExternalLink, Zap, Clock, Mail, Timer, GitBranch, ArrowDown, Phone, MessageSquare, Radio } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

type WorkflowNodeType = "send_email" | "send_sms" | "send_whatsapp" | "send_rcs" | "wait" | "condition" | "webhook";

interface WorkflowNodeData {
  id: string;
  type: WorkflowNodeType;
  config: Record<string, unknown>;
}

function getNodeLabel(node: WorkflowNodeData): string {
  switch (node.type) {
    case "send_email": return node.config.templateName as string || "Send Email";
    case "send_sms": return node.config.templateName as string || "Send SMS";
    case "send_whatsapp": return node.config.templateName as string || "Send WhatsApp";
    case "send_rcs": return node.config.templateName as string || "Send RCS";
    case "wait": {
      const d = (node.config.duration as number) || 1;
      const u = (node.config.unit as string) || "hours";
      return `Wait ${d} ${u}`;
    }
    case "condition": return (node.config.condition as string)?.replace(/_/g, " ") || "Condition";
    case "webhook": return "Webhook";
    default: return node.type;
  }
}

function getNodeStyle(type: WorkflowNodeType): string {
  switch (type) {
    case "send_email": return "bg-blue-50 border-blue-200 text-blue-700";
    case "send_sms": return "bg-purple-50 border-purple-200 text-purple-700";
    case "send_whatsapp": return "bg-green-50 border-green-200 text-green-700";
    case "send_rcs": return "bg-orange-50 border-orange-200 text-orange-700";
    case "wait": return "bg-amber-50 border-amber-200 text-amber-700";
    case "condition": return "bg-emerald-50 border-emerald-200 text-emerald-700";
    case "webhook": return "bg-orange-50 border-orange-200 text-orange-700";
    default: return "bg-gray-50 border-gray-200 text-gray-700";
  }
}

function getNodeIcon(type: WorkflowNodeType) {
  switch (type) {
    case "send_email": return Mail;
    case "send_sms": return MessageSquare;
    case "send_whatsapp": return Phone;
    case "send_rcs": return Radio;
    case "wait": return Timer;
    case "condition": return GitBranch;
    default: return Zap;
  }
}

export default function ProgramDetailPage() {
  const params = useParams();
  const programId = params.id as string;

  type Template = { id: string; name: string; subject: string; previewText?: string | null };
  type WhatsAppTemplate = { id: string; name: string; body: string; variables: string[]; category: string; language: string };
  type SmsTemplate = { id: string; name: string; body: string; variables: string[] };
  type RcsTemplate = { id: string; name: string; body: string; cardTitle: string; cardImageUrl: string | null; actions: { type: string; label: string; value: string }[]; variables: string[] };
  type WorkflowData = { id: string; name: string; triggerType: string; triggerConfig: unknown; nodes: unknown; status: string } | null;
  type ProgramDetail = { id: string; name: string; description: string; status: string; programType: string; templateIds: string[]; whatsappTemplateIds: string[]; smsTemplateIds: string[]; rcsTemplateIds: string[]; templates: Template[]; whatsappTemplates: WhatsAppTemplate[]; smsTemplates: SmsTemplate[]; rcsTemplates: RcsTemplate[]; workflowId?: string | null; workflow?: WorkflowData };
  const { data, isLoading } = (trpc.programs.getById as any).useQuery({ id: programId }) as { data: ProgramDetail | undefined; isLoading: boolean };
  const utils = trpc.useUtils();
  const activateMut = (trpc.programs.activate as any).useMutation({
    onSuccess: () => (utils.programs.getById as any).invalidate({ id: programId }),
  }) as { mutate: (input: { id: string }) => void; isPending: boolean };

  if (isLoading) {
    return <div className="text-sm text-gray-400 font-mono">Loading...</div>;
  }

  if (!data) {
    return <div className="text-sm text-gray-400 font-mono">Program not found</div>;
  }

  const workflow = data.workflow;
  const workflowNodes = (workflow?.nodes ?? []) as WorkflowNodeData[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/programs" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 font-mono tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              {data.name}
            </h1>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{data.description}</p>
          </div>
        </div>
        {data.status === "ready" && (
          <button
            onClick={() => activateMut.mutate({ id: programId })}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 transition-all"
          >
            <Play className="w-3.5 h-3.5" />
            Go Live
          </button>
        )}
      </div>

      {/* Program info */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
        {[
          { label: "TYPE", value: data.programType.replace(/_/g, " ").toUpperCase() },
          { label: "STATUS", value: data.status.toUpperCase() },
          { label: "EMAILS", value: data.templates.length.toString() },
          { label: "SMS", value: (data.smsTemplates?.length ?? 0).toString() },
          { label: "WHATSAPP", value: (data.whatsappTemplates?.length ?? 0).toString() },
          { label: "RCS", value: (data.rcsTemplates?.length ?? 0).toString() },
        ].map((item) => (
          <div key={item.label} className="border border-gray-200 rounded-xl p-5 bg-white">
            <div className="text-xs text-gray-400 font-mono uppercase tracking-wider mb-1">{item.label}</div>
            <div className="text-lg font-bold text-gray-900 font-mono">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Linked Workflow Visualization */}
      {workflow && (
        <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-bold text-gray-900 font-mono">AUTOMATION_WORKFLOW</h2>
            </div>
            <Link
              href={`/workflows/${workflow.id}/edit`}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 hover:border-gray-400 transition-all"
            >
              Edit Workflow
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <div className="p-6">
            <div className="flex flex-col items-center space-y-0">
              {/* Trigger */}
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-mono">
                <Zap className="w-3.5 h-3.5" />
                Trigger: {workflow.triggerType.replace(/_/g, " ")}
                {(() => {
                  const cfg = workflow.triggerConfig as Record<string, unknown>;
                  if (cfg?.event) return ` — ${(cfg.event as string).replace(/_/g, " ")}`;
                  if (cfg?.segmentName) return ` — ${cfg.segmentName}`;
                  if (cfg?.schedule) return ` — ${cfg.schedule}`;
                  return "";
                })()}
              </div>

              {/* Workflow nodes */}
              {workflowNodes.map((node) => {
                const Icon = getNodeIcon(node.type);
                const style = getNodeStyle(node.type);
                return (
                  <div key={node.id} className="flex flex-col items-center">
                    <div className="w-px h-6 bg-gray-300" />
                    <ArrowDown className="w-3 h-3 text-gray-300 -mt-0.5 -mb-0.5" />
                    <div className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-xs font-mono ${style}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {getNodeLabel(node)}
                    </div>
                  </div>
                );
              })}

              {/* End */}
              <div className="flex flex-col items-center">
                <div className="w-px h-6 bg-gray-300" />
                <div className="w-8 h-8 rounded-full border-2 border-gray-300 bg-white flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <span className="text-[10px] font-mono text-gray-400 mt-1">END</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generated emails */}
      <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-bold text-gray-900 font-mono">GENERATED_EMAILS</h2>
        </div>
        {data.templates.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {data.templates.map((template, i) => (
              <div key={template.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-white text-xs font-mono font-bold">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-gray-900 font-mono truncate">{template.name}</h3>
                  <p className="text-xs text-gray-400 font-mono truncate">{template.subject}</p>
                </div>
                <Link
                  href={`/templates/${template.id}/edit`}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 hover:border-gray-400 transition-all"
                >
                  <FileText className="w-3 h-3" />
                  Edit
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-16 text-center">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400 font-mono">No emails generated yet</p>
          </div>
        )}
      </div>

      {/* SMS messages */}
      {data.smsTemplates && data.smsTemplates.length > 0 && (
        <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <MessageSquare className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-bold text-gray-900 font-mono">SMS_MESSAGES</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {data.smsTemplates.map((template, i) => (
              <div key={template.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center text-white text-xs font-mono font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 font-mono">{template.name}</h3>
                    <p className="text-xs text-gray-600 font-mono mt-1 whitespace-pre-line leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">
                      {template.body}
                    </p>
                    {template.variables && (template.variables as string[]).length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-mono text-gray-400 uppercase">Variables:</span>
                        {(template.variables as string[]).map((v: string) => (
                          <span key={v} className="px-1.5 py-0.5 bg-purple-50 border border-purple-200 rounded text-[10px] font-mono text-purple-700">
                            {v}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WhatsApp messages */}
      {data.whatsappTemplates && data.whatsappTemplates.length > 0 && (
        <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <Phone className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-bold text-gray-900 font-mono">WHATSAPP_MESSAGES</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {data.whatsappTemplates.map((template, i) => (
              <div key={template.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white text-xs font-mono font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 font-mono">{template.name}</h3>
                    <p className="text-xs text-gray-600 font-mono mt-1 whitespace-pre-line leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">
                      {template.body}
                    </p>
                    {template.variables && (template.variables as string[]).length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-mono text-gray-400 uppercase">Variables:</span>
                        {(template.variables as string[]).map((v: string) => (
                          <span key={v} className="px-1.5 py-0.5 bg-green-50 border border-green-200 rounded text-[10px] font-mono text-green-700">
                            {v}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RCS messages */}
      {data.rcsTemplates && data.rcsTemplates.length > 0 && (
        <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <Radio className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-bold text-gray-900 font-mono">RCS_MESSAGES</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {data.rcsTemplates.map((template, i) => (
              <div key={template.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white text-xs font-mono font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 font-mono">{template.name}</h3>
                    {template.cardTitle && (
                      <p className="text-xs font-bold text-orange-700 font-mono mt-1">{template.cardTitle}</p>
                    )}
                    <p className="text-xs text-gray-600 font-mono mt-1 whitespace-pre-line leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">
                      {template.body}
                    </p>
                    {template.actions && template.actions.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-mono text-gray-400 uppercase">Actions:</span>
                        {template.actions.map((a: { type: string; label: string; value: string }, idx: number) => (
                          <span key={idx} className="px-1.5 py-0.5 bg-orange-50 border border-orange-200 rounded text-[10px] font-mono text-orange-700">
                            {a.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {template.variables && (template.variables as string[]).length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-mono text-gray-400 uppercase">Variables:</span>
                        {(template.variables as string[]).map((v: string) => (
                          <span key={v} className="px-1.5 py-0.5 bg-orange-50 border border-orange-200 rounded text-[10px] font-mono text-orange-700">
                            {v}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
