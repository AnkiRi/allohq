"use client";

import { useParams } from "next/navigation";
import { ArrowLeft, FileText, Sparkles, Play, Zap, Clock, Mail, Timer, GitBranch, ArrowDown, Phone, MessageSquare, Radio, Pause } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

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
    default: return "bg-muted border-border text-foreground";
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

export default function AutomationDetailPage() {
  const params = useParams();
  const automationId = params.id as string;
  const { toast } = useToast();

  type Template = { id: string; name: string; subject: string; previewText?: string | null };
  type WhatsAppTemplate = { id: string; name: string; body: string; variables: string[]; category: string; language: string };
  type SmsTemplate = { id: string; name: string; body: string; variables: string[] };
  type RcsTemplate = { id: string; name: string; body: string; cardTitle: string; cardImageUrl: string | null; actions: { type: string; label: string; value: string }[]; variables: string[] };
  type AutomationDetail = {
    id: string; name: string; description: string | null; status: string; category: string;
    triggerType: string; triggerConfig: unknown; nodes: unknown;
    templateIds: string[]; whatsappTemplateIds: string[]; smsTemplateIds: string[]; rcsTemplateIds: string[];
    templates: Template[]; whatsappTemplates: WhatsAppTemplate[]; smsTemplates: SmsTemplate[]; rcsTemplates: RcsTemplate[];
  };

  const { data, isLoading } = (trpc.automations.getById as any).useQuery({ id: automationId }) as { data: AutomationDetail | undefined; isLoading: boolean };
  const utils = trpc.useUtils();

  const activateMut = (trpc.automations.activate as any).useMutation({
    onSuccess: () => { (utils.automations.getById as any).invalidate({ id: automationId }); toast("Automation activated!", "success"); },
    onError: (err: { message?: string }) => toast(err.message || "Failed to activate", "error"),
  }) as { mutate: (input: { id: string }) => void; isPending: boolean };

  const pauseMut = (trpc.automations.pause as any).useMutation({
    onSuccess: () => { (utils.automations.getById as any).invalidate({ id: automationId }); toast("Automation paused", "info"); },
    onError: (err: { message?: string }) => toast(err.message || "Failed to pause", "error"),
  }) as { mutate: (input: { id: string }) => void; isPending: boolean };

  const resumeMut = (trpc.automations.resume as any).useMutation({
    onSuccess: () => { (utils.automations.getById as any).invalidate({ id: automationId }); toast("Automation resumed!", "success"); },
    onError: (err: { message?: string }) => toast(err.message || "Failed to resume", "error"),
  }) as { mutate: (input: { id: string }) => void; isPending: boolean };

  if (isLoading) {
    return <div className="text-[13px] text-muted-foreground font-mono">Loading...</div>;
  }

  if (!data) {
    return <div className="text-[13px] text-muted-foreground font-mono">Automation not found</div>;
  }

  const workflowNodes = (data.nodes ?? []) as WorkflowNodeData[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/automations" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-[18px] tracking-[-0.5px] font-bold text-foreground font-mono flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              {data.name}
            </h1>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{data.description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {data.status === "ready" && (
            <button
              onClick={() => activateMut.mutate({ id: automationId })}
              disabled={activateMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono hover:bg-secondary/90 transition-all"
            >
              <Play className="w-3.5 h-3.5" />
              Go Live
            </button>
          )}
          {data.status === "active" && (
            <button
              onClick={() => pauseMut.mutate({ id: automationId })}
              disabled={pauseMut.isPending}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-xs font-mono text-foreground hover:border-primary/50 transition-all"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause
            </button>
          )}
          {data.status === "paused" && (
            <button
              onClick={() => resumeMut.mutate({ id: automationId })}
              disabled={resumeMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono hover:bg-secondary/90 transition-all"
            >
              <Play className="w-3.5 h-3.5" />
              Resume
            </button>
          )}
        </div>
      </div>

      {/* Automation info */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
        {[
          { label: "CATEGORY", value: data.category.replace(/_/g, " ").toUpperCase() },
          { label: "STATUS", value: data.status.toUpperCase() },
          { label: "EMAILS", value: data.templates.length.toString() },
          { label: "SMS", value: (data.smsTemplates?.length ?? 0).toString() },
          { label: "WHATSAPP", value: (data.whatsappTemplates?.length ?? 0).toString() },
          { label: "RCS", value: (data.rcsTemplates?.length ?? 0).toString() },
        ].map((item) => (
          <div key={item.label} className="border border-border rounded-xl p-5 bg-card">
            <div className="text-[10px] text-muted-foreground font-mono uppercase font-bold tracking-[1px] mb-1">{item.label}</div>
            <div className="text-[18px] tabular-nums font-bold text-foreground font-mono">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Workflow Visualization */}
      {workflowNodes.length > 0 && (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <Zap className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-bold text-foreground font-mono">AUTOMATION_FLOW</h2>
          </div>
          <div className="p-6">
            <div className="flex flex-col items-center space-y-0">
              {/* Trigger */}
              <div className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono">
                <Zap className="w-3.5 h-3.5" />
                Trigger: {data.triggerType.replace(/_/g, " ")}
                {(() => {
                  const cfg = data.triggerConfig as Record<string, unknown>;
                  if (cfg?.event) return ` \u2014 ${(cfg.event as string).replace(/_/g, " ")}`;
                  if (cfg?.segmentName) return ` \u2014 ${cfg.segmentName}`;
                  if (cfg?.schedule) return ` \u2014 ${cfg.schedule}`;
                  return "";
                })()}
              </div>

              {/* Workflow nodes */}
              {workflowNodes.map((node) => {
                const Icon = getNodeIcon(node.type);
                const style = getNodeStyle(node.type);
                return (
                  <div key={node.id} className="flex flex-col items-center">
                    <div className="w-px h-6 bg-muted-foreground/50" />
                    <ArrowDown className="w-3 h-3 text-muted-foreground/50 -mt-0.5 -mb-0.5" />
                    <div className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-xs font-mono ${style}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {getNodeLabel(node)}
                    </div>
                  </div>
                );
              })}

              {/* End */}
              <div className="flex flex-col items-center">
                <div className="w-px h-6 bg-muted-foreground/50" />
                <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/50 bg-card flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground mt-1">END</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generated emails */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[13px] font-bold text-foreground font-mono">GENERATED_EMAILS</h2>
        </div>
        {data.templates.length > 0 ? (
          <div className="divide-y divide-border">
            {data.templates.map((template, i) => (
              <div key={template.id} className="flex items-center gap-4 px-6 py-4 hover:bg-muted transition-colors">
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-secondary-foreground text-xs font-mono font-bold">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[13px] font-bold text-foreground font-mono truncate">{template.name}</h3>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">{template.subject}</p>
                </div>
                <Link
                  href={`/templates/${template.id}/edit`}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-[11px] font-mono text-foreground hover:border-primary/50 transition-all"
                >
                  <FileText className="w-3 h-3" />
                  Edit
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-16 text-center">
            <FileText className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-[13px] text-muted-foreground font-mono">No emails generated yet</p>
          </div>
        )}
      </div>

      {/* SMS messages */}
      {data.smsTemplates && data.smsTemplates.length > 0 && (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-bold text-foreground font-mono">SMS_MESSAGES</h2>
          </div>
          <div className="divide-y divide-border">
            {data.smsTemplates.map((template, i) => (
              <div key={template.id} className="px-6 py-4 hover:bg-muted transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center text-white text-xs font-mono font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[13px] font-bold text-foreground font-mono">{template.name}</h3>
                    <p className="text-[11px] text-muted-foreground font-mono mt-1 whitespace-pre-line leading-relaxed bg-muted rounded-lg p-3 border border-border">
                      {template.body}
                    </p>
                    {template.variables && (template.variables as string[]).length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">Variables:</span>
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
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <Phone className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-bold text-foreground font-mono">WHATSAPP_MESSAGES</h2>
          </div>
          <div className="divide-y divide-border">
            {data.whatsappTemplates.map((template, i) => (
              <div key={template.id} className="px-6 py-4 hover:bg-muted transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white text-xs font-mono font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[13px] font-bold text-foreground font-mono">{template.name}</h3>
                    <p className="text-[11px] text-muted-foreground font-mono mt-1 whitespace-pre-line leading-relaxed bg-muted rounded-lg p-3 border border-border">
                      {template.body}
                    </p>
                    {template.variables && (template.variables as string[]).length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">Variables:</span>
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
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <Radio className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-bold text-foreground font-mono">RCS_MESSAGES</h2>
          </div>
          <div className="divide-y divide-border">
            {data.rcsTemplates.map((template, i) => (
              <div key={template.id} className="px-6 py-4 hover:bg-muted transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white text-xs font-mono font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[13px] font-bold text-foreground font-mono">{template.name}</h3>
                    {template.cardTitle && (
                      <p className="text-[11px] font-bold text-orange-700 font-mono mt-1">{template.cardTitle}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground font-mono mt-1 whitespace-pre-line leading-relaxed bg-muted rounded-lg p-3 border border-border">
                      {template.body}
                    </p>
                    {template.actions && template.actions.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">Actions:</span>
                        {template.actions.map((a: { type: string; label: string; value: string }, idx: number) => (
                          <span key={idx} className="px-1.5 py-0.5 bg-orange-50 border border-orange-200 rounded text-[10px] font-mono text-orange-700">
                            {a.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {template.variables && (template.variables as string[]).length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">Variables:</span>
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
