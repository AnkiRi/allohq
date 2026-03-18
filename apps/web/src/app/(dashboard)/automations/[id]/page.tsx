"use client";

import { useParams } from "next/navigation";
import { ArrowLeft, FileText, Sparkles, Play, Zap, Clock, Mail, Timer, GitBranch, ArrowDown, Phone, MessageSquare, Radio, Pause, Route, FlaskConical, Users, VolumeX } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

type WorkflowNodeType = "send_email" | "send_sms" | "send_whatsapp" | "send_rcs" | "wait" | "condition" | "webhook" | "channel_select" | "ab_test" | "silence_check";

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
    case "channel_select": return "Adaptive Channel";
    case "ab_test": return (node.config.testName as string) || "A/B Test";
    case "silence_check": return `Silence Check (${(node.config.threshold as number) ?? 3} touches)`;
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
    case "channel_select": return "bg-cyan-50 border-cyan-200 text-cyan-700";
    case "ab_test": return "bg-pink-50 border-pink-200 text-pink-700";
    case "silence_check": return "bg-rose-50 border-rose-200 text-rose-700";
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
    case "channel_select": return Route;
    case "ab_test": return FlaskConical;
    case "silence_check": return VolumeX;
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

  // Journey stats & A/B tests
  const { data: journeyStats } = (trpc as any).automations.journeyStats?.useQuery?.(
    { automationId },
    { enabled: !!automationId },
  ) as { data: { total: number; active: number; completed: number; suppressed: number; paused: number; channelUsage: Record<string, number>; suppressReasons: Record<string, number>; avgStepsCompleted: number } | undefined };

  const { data: journeysData } = (trpc as any).automations.listJourneys?.useQuery?.(
    { automationId, limit: 10 },
    { enabled: !!automationId },
  ) as { data: { journeys: Array<{ id: string; status: string; currentStep: number; totalSteps: number; channelPath: string[]; startedAt: string; customer: { firstName: string | null; lastName: string | null; email: string } }>; total: number } | undefined };

  const { data: abTests } = (trpc as any).automations.listABTests?.useQuery?.(
    { automationId },
    { enabled: !!automationId },
  ) as { data: Array<{ id: string; name: string; variable: string; status: string; winner: string | null; confidence: number | null; results: Record<string, { sent: number; opened: number; clicked: number; converted: number; revenue: number }> }> | undefined };

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
          <Link
            href={`/automations/${automationId}/ab-test`}
            className="flex items-center gap-2 px-3 py-2 border border-pink-200 bg-pink-50 text-pink-700 rounded-lg text-xs font-mono font-bold hover:bg-pink-100 transition-all"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            A/B Tests
          </Link>
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

      {/* Journey Monitoring */}
      {journeyStats && journeyStats.total > 0 && (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <Route className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-bold text-foreground font-mono">JOURNEY_MONITORING</h2>
            <span className="ml-auto text-[10px] font-mono text-muted-foreground">{journeyStats.total} journeys</span>
          </div>

          {/* Journey stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-border">
            {[
              { label: "Active", value: journeyStats.active, color: "text-blue-600" },
              { label: "Completed", value: journeyStats.completed, color: "text-green-600" },
              { label: "Suppressed", value: journeyStats.suppressed, color: "text-amber-600" },
              { label: "Paused", value: journeyStats.paused, color: "text-gray-500" },
              { label: "Avg Steps", value: journeyStats.avgStepsCompleted, color: "text-foreground" },
            ].map((stat) => (
              <div key={stat.label} className="bg-card p-4 text-center">
                <div className={`text-[18px] font-bold font-mono ${stat.color}`}>{stat.value}</div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Channel usage */}
          {Object.keys(journeyStats.channelUsage).length > 0 && (
            <div className="px-6 py-3 border-t border-border">
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-2">Channel Usage</div>
              <div className="flex gap-2">
                {Object.entries(journeyStats.channelUsage).map(([ch, count]) => (
                  <span key={ch} className="px-2 py-1 bg-muted rounded text-[11px] font-mono">
                    {ch}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Suppress reasons */}
          {Object.keys(journeyStats.suppressReasons).length > 0 && (
            <div className="px-6 py-3 border-t border-border">
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-2">Suppression Reasons</div>
              <div className="flex gap-2">
                {Object.entries(journeyStats.suppressReasons).map(([reason, count]) => (
                  <span key={reason} className="px-2 py-1 bg-amber-50 border border-amber-200 rounded text-[11px] font-mono text-amber-700">
                    {reason}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recent journeys */}
          {journeysData && journeysData.journeys.length > 0 && (
            <div className="border-t border-border">
              <div className="px-6 py-3">
                <div className="text-[10px] font-mono text-muted-foreground uppercase mb-2">Recent Journeys</div>
              </div>
              <div className="divide-y divide-border">
                {journeysData.journeys.map((journey) => (
                  <div key={journey.id} className="px-6 py-3 flex items-center gap-4">
                    <Users className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-mono text-foreground">
                        {journey.customer.firstName ?? ""} {journey.customer.lastName ?? journey.customer.email}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Step {journey.currentStep}/{journey.totalSteps}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {(journey.channelPath as string[]).join(" → ")}
                        </span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                      journey.status === "active" ? "bg-blue-50 text-blue-700" :
                      journey.status === "completed" ? "bg-green-50 text-green-700" :
                      journey.status === "suppressed" ? "bg-amber-50 text-amber-700" :
                      "bg-gray-50 text-gray-600"
                    }`}>
                      {journey.status}
                    </span>
                  </div>
                ))}
              </div>
              {journeysData.total > 10 && (
                <div className="px-6 py-2 text-center text-[10px] font-mono text-muted-foreground border-t border-border">
                  +{journeysData.total - 10} more journeys
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* A/B Tests */}
      {abTests && abTests.length > 0 && (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <FlaskConical className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-bold text-foreground font-mono">AB_TESTS</h2>
          </div>
          <div className="divide-y divide-border">
            {abTests.map((test) => {
              const a = test.results?.["a"];
              const b = test.results?.["b"];
              return (
                <div key={test.id} className="px-6 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-[13px] font-bold font-mono text-foreground">{test.name}</h3>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">{test.variable.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        test.status === "running" ? "bg-blue-50 text-blue-700" :
                        test.status === "concluded" ? "bg-green-50 text-green-700" :
                        "bg-gray-50 text-gray-600"
                      }`}>
                        {test.status}
                      </span>
                      {test.winner && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-[10px] font-mono font-bold">
                          Winner: {test.winner.toUpperCase()}
                        </span>
                      )}
                      {test.confidence != null && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {(test.confidence * 100).toFixed(1)}% confidence
                        </span>
                      )}
                    </div>
                  </div>
                  {(a || b) && (
                    <div className="grid grid-cols-2 gap-3">
                      {["a", "b"].map((variant) => {
                        const r = test.results?.[variant];
                        if (!r) return null;
                        return (
                          <div key={variant} className={`p-3 rounded-lg border ${
                            test.winner === variant ? "border-green-300 bg-green-50" : "border-border bg-muted/50"
                          }`}>
                            <div className="text-[11px] font-mono font-bold mb-2">Variant {variant.toUpperCase()}</div>
                            <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-muted-foreground">
                              <span>Sent: {r.sent}</span>
                              <span>Opened: {r.opened}</span>
                              <span>Clicked: {r.clicked}</span>
                              <span>Converted: {r.converted}</span>
                            </div>
                            {r.revenue > 0 && (
                              <div className="text-[11px] font-mono text-green-700 mt-1">
                                Revenue: ${r.revenue.toFixed(2)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
