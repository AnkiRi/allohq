"use client";

import { useParams } from "next/navigation";
import { ArrowLeft, FileText, Sparkles, Play, Zap, Clock, Mail, Timer, GitBranch, ArrowDown, Phone, MessageSquare, Radio, Pause, Route, FlaskConical, Users, VolumeX, Pencil } from "lucide-react";
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
  // One quiet surface for every node — the icon and label carry the meaning, not
  // a rainbow. The two nodes that change WHO gets messaged are marked: a "wait"
  // holds the line, a "silence_check" is allo deciding to leave someone alone.
  switch (type) {
    case "silence_check": return "bg-card border-l-2 border-l-[var(--color-warning)] border border-border text-foreground";
    case "wait": return "bg-muted border-dashed border-border text-muted-foreground";
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
    onSuccess: () => { (utils.automations.getById as any).invalidate({ id: automationId }); toast("It's live.", "success"); },
    onError: (err: { message?: string }) => toast(err.message || "We couldn't take that live. Mind trying again?", "error"),
  }) as { mutate: (input: { id: string }) => void; isPending: boolean };

  const pauseMut = (trpc.automations.pause as any).useMutation({
    onSuccess: () => { (utils.automations.getById as any).invalidate({ id: automationId }); toast("Paused for now.", "info"); },
    onError: (err: { message?: string }) => toast(err.message || "We couldn't pause that. Mind trying again?", "error"),
  }) as { mutate: (input: { id: string }) => void; isPending: boolean };

  const resumeMut = (trpc.automations.resume as any).useMutation({
    onSuccess: () => { (utils.automations.getById as any).invalidate({ id: automationId }); toast("Back up and running.", "success"); },
    onError: (err: { message?: string }) => toast(err.message || "We couldn't resume that. Mind trying again?", "error"),
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
    return <div className="text-[13px] text-muted-foreground font-sans">Loading…</div>;
  }

  if (!data) {
    return <div className="text-[13px] text-muted-foreground font-sans">We couldn't find this automation.</div>;
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
            <h1 className="text-[18px] tracking-[-0.5px] font-semibold text-foreground font-serif flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              {data.name}
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">{data.description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/automations/${automationId}/edit`}
            className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-xs font-sans font-bold text-foreground hover:bg-muted transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit Flow
          </Link>
          <Link
            href={`/automations/${automationId}/ab-test`}
            className="flex items-center gap-2 px-3 py-2 border border-border bg-card text-foreground rounded-lg text-xs font-sans font-bold hover:bg-muted transition-all"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            A/B Tests
          </Link>
          {data.status === "ready" && (
            <button
              onClick={() => activateMut.mutate({ id: automationId })}
              disabled={activateMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-sans hover:bg-secondary/90 transition-all"
            >
              <Play className="w-3.5 h-3.5" />
              Go Live
            </button>
          )}
          {data.status === "active" && (
            <button
              onClick={() => pauseMut.mutate({ id: automationId })}
              disabled={pauseMut.isPending}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-xs font-sans text-foreground hover:border-primary/50 transition-all"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause
            </button>
          )}
          {data.status === "paused" && (
            <button
              onClick={() => resumeMut.mutate({ id: automationId })}
              disabled={resumeMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-sans hover:bg-secondary/90 transition-all"
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
          { label: "Category", value: data.category.replace(/_/g, " ").toUpperCase() },
          { label: "Status", value: data.status.toUpperCase() },
          { label: "Emails", value: data.templates.length.toString() },
          { label: "SMS", value: (data.smsTemplates?.length ?? 0).toString() },
          { label: "WhatsApp", value: (data.whatsappTemplates?.length ?? 0).toString() },
          { label: "RCS", value: (data.rcsTemplates?.length ?? 0).toString() },
        ].map((item) => (
          <div key={item.label} className="border border-border rounded-xl p-5 bg-card">
            <div className="text-[10px] text-muted-foreground font-sans uppercase font-bold tracking-[1px] mb-1">{item.label}</div>
            <div className="text-[18px] tabular-nums font-bold text-foreground font-mono">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Workflow Visualization */}
      {workflowNodes.length > 0 && (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <Zap className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-bold text-foreground font-serif">Automation flow</h2>
          </div>
          <div className="p-6">
            <div className="flex flex-col items-center space-y-0">
              {/* Trigger */}
              <div className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-sans">
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
                    <div className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-xs font-sans ${style}`}>
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
                <span className="text-[10px] font-sans text-muted-foreground mt-1">END</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generated emails */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[13px] font-bold text-foreground font-serif">Emails allo wrote</h2>
        </div>
        {data.templates.length > 0 ? (
          <div className="divide-y divide-border">
            {data.templates.map((template, i) => (
              <div key={template.id} className="flex items-center gap-4 px-6 py-4 hover:bg-muted transition-colors">
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-secondary-foreground text-xs font-mono font-bold">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[13px] font-bold text-foreground font-serif truncate">{template.name}</h3>
                  <p className="text-[11px] text-muted-foreground truncate">{template.subject}</p>
                </div>
                <Link
                  href={`/templates/${template.id}/edit`}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-[11px] font-sans text-foreground hover:border-primary/50 transition-all"
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
            <p className="text-[13px] text-muted-foreground">Nothing written yet. allo is just getting started.</p>
          </div>
        )}
      </div>

      {/* SMS messages */}
      {data.smsTemplates && data.smsTemplates.length > 0 && (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-bold text-foreground font-serif">SMS messages</h2>
          </div>
          <div className="divide-y divide-border">
            {data.smsTemplates.map((template, i) => (
              <div key={template.id} className="px-6 py-4 hover:bg-muted transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-secondary-foreground text-xs font-mono font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[13px] font-bold text-foreground font-serif">{template.name}</h3>
                    <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-line leading-relaxed bg-muted rounded-lg p-3 border border-border">
                      {template.body}
                    </p>
                    {template.variables && (template.variables as string[]).length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-sans text-muted-foreground uppercase">Variables:</span>
                        {(template.variables as string[]).map((v: string) => (
                          <span key={v} className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono text-muted-foreground">
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
            <h2 className="text-[13px] font-bold text-foreground font-serif">WhatsApp messages</h2>
          </div>
          <div className="divide-y divide-border">
            {data.whatsappTemplates.map((template, i) => (
              <div key={template.id} className="px-6 py-4 hover:bg-muted transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-secondary-foreground text-xs font-mono font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[13px] font-bold text-foreground font-serif">{template.name}</h3>
                    <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-line leading-relaxed bg-muted rounded-lg p-3 border border-border">
                      {template.body}
                    </p>
                    {template.variables && (template.variables as string[]).length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-sans text-muted-foreground uppercase">Variables:</span>
                        {(template.variables as string[]).map((v: string) => (
                          <span key={v} className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono text-muted-foreground">
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
            <h2 className="text-[13px] font-bold text-foreground font-serif">RCS messages</h2>
          </div>
          <div className="divide-y divide-border">
            {data.rcsTemplates.map((template, i) => (
              <div key={template.id} className="px-6 py-4 hover:bg-muted transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-secondary-foreground text-xs font-mono font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[13px] font-bold text-foreground font-serif">{template.name}</h3>
                    {template.cardTitle && (
                      <p className="text-[11px] font-bold text-foreground mt-1">{template.cardTitle}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-line leading-relaxed bg-muted rounded-lg p-3 border border-border">
                      {template.body}
                    </p>
                    {template.actions && template.actions.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-sans text-muted-foreground uppercase">Actions:</span>
                        {template.actions.map((a: { type: string; label: string; value: string }, idx: number) => (
                          <span key={idx} className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono text-foreground">
                            {a.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {template.variables && (template.variables as string[]).length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-sans text-muted-foreground uppercase">Variables:</span>
                        {(template.variables as string[]).map((v: string) => (
                          <span key={v} className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono text-muted-foreground">
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
            <h2 className="text-[13px] font-bold text-foreground font-serif">Journey monitoring</h2>
            <span className="ml-auto text-[10px] font-mono text-muted-foreground">{journeyStats.total} journeys</span>
          </div>

          {/* Journey stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-border">
            {[
              { label: "Active", value: journeyStats.active, color: "text-[var(--color-accent)]" },
              { label: "Completed", value: journeyStats.completed, color: "text-[hsl(var(--success))]" },
              { label: "Left alone", value: journeyStats.suppressed, color: "text-[var(--color-warning)]" },
              { label: "Paused", value: journeyStats.paused, color: "text-muted-foreground" },
              { label: "Avg Steps", value: journeyStats.avgStepsCompleted, color: "text-foreground" },
            ].map((stat) => (
              <div key={stat.label} className="bg-card p-4 text-center">
                <div className={`text-[18px] font-bold font-mono ${stat.color}`}>{stat.value}</div>
                <div className="text-[10px] font-sans text-muted-foreground uppercase mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Channel usage */}
          {Object.keys(journeyStats.channelUsage).length > 0 && (
            <div className="px-6 py-3 border-t border-border">
              <div className="text-[10px] font-sans text-muted-foreground uppercase mb-2">Channel Usage</div>
              <div className="flex gap-2">
                {Object.entries(journeyStats.channelUsage).map(([ch, count]) => (
                  <span key={ch} className="px-2 py-1 bg-muted rounded text-[11px] font-mono">
                    {ch}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Suppress reasons — allo's restraint, named */}
          {Object.keys(journeyStats.suppressReasons).length > 0 && (
            <div className="px-6 py-3 border-t border-border">
              <div className="text-[10px] font-sans text-muted-foreground uppercase mb-2">Left alone, and why</div>
              <div className="flex gap-2">
                {Object.entries(journeyStats.suppressReasons).map(([reason, count]) => (
                  <span key={reason} className="px-2 py-1 bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/25 rounded text-[11px] font-mono text-[var(--color-warning)]">
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
                <div className="text-[10px] font-sans text-muted-foreground uppercase mb-2">Recent Journeys</div>
              </div>
              <div className="divide-y divide-border">
                {journeysData.journeys.map((journey) => (
                  <div key={journey.id} className="px-6 py-3 flex items-center gap-4">
                    <Users className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-sans text-foreground">
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
                    <span className={`px-2 py-0.5 rounded text-[10px] font-sans ${
                      journey.status === "active" ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]" :
                      journey.status === "completed" ? "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]" :
                      journey.status === "suppressed" ? "bg-[var(--color-warning)]/10 text-[var(--color-warning)]" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {journey.status === "suppressed" ? "left alone" : journey.status}
                    </span>
                  </div>
                ))}
              </div>
              {journeysData.total > 10 && (
                <div className="px-6 py-2 text-center text-[10px] font-sans text-muted-foreground border-t border-border">
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
            <h2 className="text-[13px] font-bold text-foreground font-serif">A/B tests</h2>
          </div>
          <div className="divide-y divide-border">
            {abTests.map((test) => {
              const a = test.results?.["a"];
              const b = test.results?.["b"];
              return (
                <div key={test.id} className="px-6 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-[13px] font-bold font-serif text-foreground">{test.name}</h3>
                      <span className="text-[10px] font-sans text-muted-foreground uppercase">{test.variable.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-sans ${
                        test.status === "running" ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]" :
                        test.status === "concluded" ? "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {test.status}
                      </span>
                      {test.winner && (
                        <span className="px-2 py-0.5 bg-[hsl(var(--success)/0.16)] text-[hsl(var(--success))] rounded text-[10px] font-sans font-bold">
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
                            test.winner === variant ? "border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.08)]" : "border-border bg-muted/50"
                          }`}>
                            <div className="text-[11px] font-sans font-bold mb-2">Variant {variant.toUpperCase()}</div>
                            <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-muted-foreground">
                              <span>Sent: {r.sent}</span>
                              <span>Opened: {r.opened}</span>
                              <span>Clicked: {r.clicked}</span>
                              <span>Converted: {r.converted}</span>
                            </div>
                            {r.revenue > 0 && (
                              <div className="text-[11px] font-mono text-[hsl(var(--success))] mt-1">
                                Revenue: ₹{r.revenue.toFixed(2)}
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
