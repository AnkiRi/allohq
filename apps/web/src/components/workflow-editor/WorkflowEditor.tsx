"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Zap, Clock, Users, LogOut, Mail, MessageSquare, Timer,
  GitBranch, Webhook, Plus, Trash2, Save, Loader2, Check,
  ChevronDown, ArrowDown, Phone, Radio,
} from "lucide-react";
import { cn } from "@allohq/ui";
import { TemplatePicker } from "./TemplatePicker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TriggerType = "event" | "schedule" | "segment_entry" | "segment_exit";

interface WorkflowNode {
  id: string;
  type: "send_email" | "send_sms" | "send_whatsapp" | "send_rcs" | "wait" | "condition" | "webhook";
  config: Record<string, unknown>;
}

interface WorkflowEditorProps {
  initialTriggerType?: TriggerType;
  initialTriggerConfig?: Record<string, unknown>;
  initialNodes?: WorkflowNode[];
  onSave: (triggerType: TriggerType, triggerConfig: Record<string, unknown>, nodes: WorkflowNode[]) => Promise<void>;
  saving?: boolean;
}

// ---------------------------------------------------------------------------
// Trigger options
// ---------------------------------------------------------------------------

const TRIGGER_OPTIONS: { type: TriggerType; label: string; description: string; icon: typeof Zap }[] = [
  { type: "event", label: "Event", description: "Customer performs an action (purchase, cart abandon, etc.)", icon: Zap },
  { type: "schedule", label: "Schedule", description: "Run on a recurring schedule (daily, weekly)", icon: Clock },
  { type: "segment_entry", label: "Segment Entry", description: "Customer enters a segment", icon: Users },
  { type: "segment_exit", label: "Segment Exit", description: "Customer leaves a segment", icon: LogOut },
];

const EVENT_OPTIONS = [
  { value: "order_placed", label: "Order Placed" },
  { value: "cart_abandoned", label: "Cart Abandoned" },
  { value: "customer_created", label: "New Customer" },
  { value: "product_viewed", label: "Product Viewed" },
  { value: "tag_added", label: "Tag Added" },
];

// ---------------------------------------------------------------------------
// Action options for adding nodes
// ---------------------------------------------------------------------------

const ACTION_OPTIONS: { type: WorkflowNode["type"]; label: string; description: string; icon: typeof Mail }[] = [
  { type: "send_email", label: "Send Email", description: "Send an email template", icon: Mail },
  { type: "send_sms", label: "Send SMS", description: "Send an SMS message", icon: MessageSquare },
  { type: "send_whatsapp", label: "Send WhatsApp", description: "Send a WhatsApp message", icon: Phone },
  { type: "send_rcs", label: "Send RCS", description: "Send a rich RCS message", icon: Radio },
  { type: "wait", label: "Wait / Delay", description: "Wait before the next step", icon: Timer },
  { type: "condition", label: "Condition", description: "Branch based on a condition", icon: GitBranch },
  { type: "webhook", label: "Webhook", description: "Call an external URL", icon: Webhook },
];

// ---------------------------------------------------------------------------
// Node config editors (with TemplatePicker)
// ---------------------------------------------------------------------------

function SendEmailConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const templateSubject = (config.templateSubject as string) || "";
  const subject = (config.subject as string) || "";
  return (
    <div className="space-y-2">
      <TemplatePicker
        channel="email"
        currentTemplateId={config.templateId as string | undefined}
        currentTemplateName={config.templateName as string | undefined}
        onPick={(t) =>
          onChange({
            ...config,
            templateId: t.id,
            templateName: t.subject || t.name,
            templateSubject: t.subject || "",
            // Subject lives ON the email — default to the template's subject; the
            // field below is an explicit per-send override, not a separate field.
            subject: (config.subject as string) || t.subject || "",
          })
        }
      />
      <div className="flex items-center justify-between mt-2">
        <label className="block text-[10px] font-sans font-semibold text-muted-foreground uppercase">
          Subject line · for this send
        </label>
        {templateSubject && subject !== templateSubject ? (
          <button
            type="button"
            onClick={() => onChange({ ...config, subject: templateSubject })}
            className="text-[10px] font-sans text-[var(--color-accent)] hover:underline"
          >
            Use the email&apos;s subject
          </button>
        ) : null}
      </div>
      <input
        type="text"
        value={subject}
        onChange={(e) => onChange({ ...config, subject: e.target.value })}
        className="w-full px-3 py-1.5 rounded-lg border border-border bg-card text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
        placeholder={templateSubject || "Defaults from the email"}
      />
      <p className="text-[10px] font-sans text-muted-foreground/70">
        Defaults from the email. Override it to send the same email with a different
        subject per segment.
      </p>
    </div>
  );
}

function SendSmsConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-2">
      <TemplatePicker
        channel="sms"
        currentTemplateId={config.smsTemplateId as string | undefined}
        currentTemplateName={config.templateName as string | undefined}
        onPick={(t) => onChange({ ...config, smsTemplateId: t.id, templateName: t.name })}
      />
    </div>
  );
}

function SendWhatsappConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-2">
      <TemplatePicker
        channel="whatsapp"
        currentTemplateId={config.whatsappTemplateId as string | undefined}
        currentTemplateName={config.templateName as string | undefined}
        onPick={(t) => onChange({ ...config, whatsappTemplateId: t.id, templateName: t.name })}
      />
    </div>
  );
}

function SendRcsConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-2">
      <TemplatePicker
        channel="rcs"
        currentTemplateId={config.rcsTemplateId as string | undefined}
        currentTemplateName={config.templateName as string | undefined}
        onPick={(t) => onChange({ ...config, rcsTemplateId: t.id, templateName: t.name })}
      />
    </div>
  );
}

function WaitConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] font-sans font-semibold text-muted-foreground uppercase">Wait</label>
      <input
        type="number"
        value={(config.duration as number) || 1}
        onChange={(e) => onChange({ ...config, duration: Number(e.target.value) })}
        min={1}
        className="w-16 px-2 py-1.5 rounded-lg border border-border bg-card text-[13px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
      />
      <select
        value={(config.unit as string) || "hours"}
        onChange={(e) => onChange({ ...config, unit: e.target.value })}
        className="px-2 py-1.5 rounded-lg border border-border bg-card text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
      >
        <option value="minutes">Minutes</option>
        <option value="hours">Hours</option>
        <option value="days">Days</option>
      </select>
    </div>
  );
}

function ConditionConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-sans font-semibold text-muted-foreground uppercase">Condition</label>
      <select
        value={(config.condition as string) || "has_purchased"}
        onChange={(e) => onChange({ ...config, condition: e.target.value })}
        className="w-full px-3 py-1.5 rounded-lg border border-border bg-card text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
      >
        <option value="has_purchased">Has made a purchase</option>
        <option value="opened_email">Opened previous email</option>
        <option value="clicked_link">Clicked a link</option>
        <option value="in_segment">Is in segment</option>
        <option value="tag_exists">Has tag</option>
      </select>
    </div>
  );
}

function WebhookConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-sans font-semibold text-muted-foreground uppercase">Webhook URL</label>
      <input
        type="url"
        value={(config.url as string) || ""}
        onChange={(e) => onChange({ ...config, url: e.target.value })}
        className="w-full px-3 py-1.5 rounded-lg border border-border bg-card text-[13px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
        placeholder="https://..."
      />
    </div>
  );
}

function NodeConfigEditor({ node, onChange }: { node: WorkflowNode; onChange: (config: Record<string, unknown>) => void }) {
  switch (node.type) {
    case "send_email": return <SendEmailConfig config={node.config} onChange={onChange} />;
    case "send_sms": return <SendSmsConfig config={node.config} onChange={onChange} />;
    case "send_whatsapp": return <SendWhatsappConfig config={node.config} onChange={onChange} />;
    case "send_rcs": return <SendRcsConfig config={node.config} onChange={onChange} />;
    case "wait": return <WaitConfig config={node.config} onChange={onChange} />;
    case "condition": return <ConditionConfig config={node.config} onChange={onChange} />;
    case "webhook": return <WebhookConfig config={node.config} onChange={onChange} />;
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Node display helpers
// ---------------------------------------------------------------------------

function getNodeIcon(type: WorkflowNode["type"]) {
  switch (type) {
    case "send_email": return Mail;
    case "send_sms": return MessageSquare;
    case "send_whatsapp": return Phone;
    case "send_rcs": return Radio;
    case "wait": return Timer;
    case "condition": return GitBranch;
    case "webhook": return Webhook;
  }
}

function getNodeColor(type: WorkflowNode["type"]) {
  switch (type) {
    case "send_email": return "bg-blue-50 border-blue-200 text-blue-700";
    case "send_sms": return "bg-purple-50 border-purple-200 text-purple-700";
    case "send_whatsapp": return "bg-green-50 border-green-200 text-green-700";
    case "send_rcs": return "bg-orange-50 border-orange-200 text-orange-700";
    case "wait": return "bg-amber-50 border-amber-200 text-amber-700";
    case "condition": return "bg-emerald-50 border-emerald-200 text-emerald-700";
    case "webhook": return "bg-orange-50 border-orange-200 text-orange-700";
  }
}

function getNodeSummary(node: WorkflowNode): string {
  switch (node.type) {
    case "send_email":
      return (node.config.templateName as string) || "Select template...";
    case "send_sms":
      return (node.config.templateName as string) || "Select template...";
    case "send_whatsapp":
      return (node.config.templateName as string) || "Select template...";
    case "send_rcs":
      return (node.config.templateName as string) || "Select template...";
    case "wait": {
      const d = (node.config.duration as number) || 1;
      const u = (node.config.unit as string) || "hours";
      return `${d} ${u}`;
    }
    case "condition":
      return (node.config.condition as string)?.replace(/_/g, " ") || "Set condition...";
    case "webhook":
      return (node.config.url as string) || "Set URL...";
  }
}

// ---------------------------------------------------------------------------
// WorkflowEditor
// ---------------------------------------------------------------------------

export function WorkflowEditor({
  initialTriggerType,
  initialTriggerConfig,
  initialNodes = [],
  onSave,
  saving,
}: WorkflowEditorProps) {
  const [triggerType, setTriggerType] = useState<TriggerType>(initialTriggerType || "event");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(initialTriggerConfig || { event: "order_placed" });
  const [nodes, setNodes] = useState<WorkflowNode[]>(initialNodes);
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState<number | null>(null); // index to insert after
  const [saveStatus, setSaveStatus] = useState<"idle" | "success">("idle");

  useEffect(() => {
    if (saveStatus === "success") {
      const t = setTimeout(() => setSaveStatus("idle"), 2000);
      return () => clearTimeout(t);
    }
  }, [saveStatus]);

  const addNode = useCallback((type: WorkflowNode["type"], afterIndex: number) => {
    const newNode: WorkflowNode = {
      id: crypto.randomUUID(),
      type,
      config: type === "wait" ? { duration: 1, unit: "hours" } : {},
    };
    setNodes((prev) => {
      const next = [...prev];
      next.splice(afterIndex + 1, 0, newNode);
      return next;
    });
    setExpandedNodeId(newNode.id);
    setShowAddMenu(null);
  }, []);

  const deleteNode = useCallback((id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    if (expandedNodeId === id) setExpandedNodeId(null);
  }, [expandedNodeId]);

  const updateNodeConfig = useCallback((id: string, config: Record<string, unknown>) => {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, config } : n));
  }, []);

  const handleSave = async () => {
    await onSave(triggerType, triggerConfig, nodes);
    setSaveStatus("success");
  };

  return (
    <div className="flex h-full gap-0 bg-card border border-border rounded-xl overflow-hidden">
      {/* Canvas */}
      <div className="flex-1 overflow-y-auto p-8 bg-muted">
        <div className="max-w-md mx-auto space-y-0">
          {/* Trigger Node */}
          <div className="relative">
            <div className="border-2 border-foreground rounded-xl bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center">
                  <Zap className="w-3 h-3 text-secondary-foreground" />
                </div>
                <span className="text-[10px] font-sans font-bold text-foreground uppercase tracking-[1px]">Trigger</span>
              </div>

              {/* Trigger type selector */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {TRIGGER_OPTIONS.map((opt) => (
                  <button
                    key={opt.type}
                    onClick={() => {
                      setTriggerType(opt.type);
                      setTriggerConfig(opt.type === "event" ? { event: "order_placed" } : {});
                    }}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg border text-left transition-all text-[11px] font-sans",
                      triggerType === opt.type
                        ? "border-secondary bg-secondary text-secondary-foreground"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    )}
                  >
                    <opt.icon className="w-3.5 h-3.5 flex-shrink-0" />
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Trigger config */}
              {triggerType === "event" && (
                <select
                  value={(triggerConfig.event as string) || "order_placed"}
                  onChange={(e) => setTriggerConfig({ event: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg border border-border bg-card text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                >
                  {EVENT_OPTIONS.map((e) => (
                    <option key={e.value} value={e.value}>{e.label}</option>
                  ))}
                </select>
              )}
              {triggerType === "schedule" && (
                <select
                  value={(triggerConfig.schedule as string) || "daily"}
                  onChange={(e) => setTriggerConfig({ schedule: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg border border-border bg-card text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                >
                  <option value="hourly">Every Hour</option>
                  <option value="daily">Every Day</option>
                  <option value="weekly">Every Week</option>
                  <option value="monthly">Every Month</option>
                </select>
              )}
              {(triggerType === "segment_entry" || triggerType === "segment_exit") && (
                <input
                  type="text"
                  value={(triggerConfig.segmentName as string) || ""}
                  onChange={(e) => setTriggerConfig({ segmentName: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg border border-border bg-card text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                  placeholder="Segment name..."
                />
              )}
            </div>

            {/* Connector line + add button */}
            <div className="flex flex-col items-center py-1">
              <div className="w-px h-4 bg-muted-foreground/50" />
              <button
                onClick={() => setShowAddMenu(showAddMenu === -1 ? null : -1)}
                className="w-7 h-7 rounded-full border-2 border-dashed border-muted-foreground/50 flex items-center justify-center text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              {showAddMenu === -1 && (
                <AddMenu onSelect={(type) => addNode(type, -1)} onClose={() => setShowAddMenu(null)} />
              )}
              <div className="w-px h-4 bg-muted-foreground/50" />
              <ArrowDown className="w-3 h-3 text-muted-foreground/50" />
            </div>
          </div>

          {/* Action Nodes */}
          {nodes.map((node, index) => {
            const Icon = getNodeIcon(node.type);
            const color = getNodeColor(node.type);
            const isExpanded = expandedNodeId === node.id;

            return (
              <div key={node.id} className="relative">
                <div
                  className={cn(
                    "border rounded-xl p-4 transition-all cursor-pointer",
                    color,
                    isExpanded && "ring-1 ring-foreground"
                  )}
                  onClick={() => setExpandedNodeId(isExpanded ? null : node.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      <span className="text-[10px] font-sans font-bold uppercase tracking-[1px]">
                        {node.type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                        className="p-1 rounded-lg text-current opacity-40 hover:opacity-100 hover:bg-black/5 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isExpanded && "rotate-180")} />
                    </div>
                  </div>

                  {/* Collapsed summary */}
                  {!isExpanded && (
                    <p className="text-[11px] font-sans mt-1.5 opacity-70 truncate">
                      {getNodeSummary(node)}
                    </p>
                  )}

                  {/* Expanded config */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-current/10" onClick={(e) => e.stopPropagation()}>
                      <NodeConfigEditor
                        node={node}
                        onChange={(config) => updateNodeConfig(node.id, config)}
                      />
                    </div>
                  )}
                </div>

                {/* Connector line + add button */}
                <div className="flex flex-col items-center py-1">
                  <div className="w-px h-4 bg-muted-foreground/50" />
                  <button
                    onClick={() => setShowAddMenu(showAddMenu === index ? null : index)}
                    className="w-7 h-7 rounded-full border-2 border-dashed border-muted-foreground/50 flex items-center justify-center text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  {showAddMenu === index && (
                    <AddMenu onSelect={(type) => addNode(type, index)} onClose={() => setShowAddMenu(null)} />
                  )}
                  <div className="w-px h-4 bg-muted-foreground/50" />
                  <ArrowDown className="w-3 h-3 text-muted-foreground/50" />
                </div>
              </div>
            );
          })}

          {/* End node */}
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full border-2 border-muted-foreground/50 bg-card flex items-center justify-center">
              <Check className="w-4 h-4 text-muted-foreground" />
            </div>
            <span className="text-[10px] font-sans text-muted-foreground mt-1.5">END</span>
          </div>
        </div>
      </div>

      {/* Right panel — Save + info */}
      <div className="w-64 border-l border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-sans transition-all",
              saveStatus === "success"
                ? "bg-green-600 text-white"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/90 disabled:opacity-70"
            )}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveStatus === "success" ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Saving..." : saveStatus === "success" ? "Saved!" : "Save Workflow"}
          </button>
        </div>

        <div className="p-4 space-y-4 flex-1">
          <div>
            <h3 className="text-[10px] font-serif font-bold text-muted-foreground uppercase tracking-wider mb-2">Summary</h3>
            <div className="space-y-2 text-[11px] font-sans text-muted-foreground">
              <div className="flex justify-between">
                <span>Trigger</span>
                <span className="font-bold text-foreground">{triggerType.replace(/_/g, " ")}</span>
              </div>
              <div className="flex justify-between">
                <span>Steps</span>
                <span className="font-mono font-bold text-foreground">{nodes.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Emails</span>
                <span className="font-mono font-bold text-foreground">{nodes.filter((n) => n.type === "send_email").length}</span>
              </div>
              <div className="flex justify-between">
                <span>SMS</span>
                <span className="font-mono font-bold text-foreground">{nodes.filter((n) => n.type === "send_sms").length}</span>
              </div>
              <div className="flex justify-between">
                <span>WhatsApp</span>
                <span className="font-mono font-bold text-foreground">{nodes.filter((n) => n.type === "send_whatsapp").length}</span>
              </div>
              <div className="flex justify-between">
                <span>RCS</span>
                <span className="font-mono font-bold text-foreground">{nodes.filter((n) => n.type === "send_rcs").length}</span>
              </div>
              <div className="flex justify-between">
                <span>Waits</span>
                <span className="font-mono font-bold text-foreground">{nodes.filter((n) => n.type === "wait").length}</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-serif font-bold text-muted-foreground uppercase tracking-wider mb-2">Quick Add</h3>
            <div className="space-y-1.5">
              {ACTION_OPTIONS.map((opt) => (
                <button
                  key={opt.type}
                  onClick={() => addNode(opt.type, nodes.length - 1)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-left text-[11px] font-sans text-muted-foreground hover:border-primary/50 hover:text-foreground transition-all"
                >
                  <opt.icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Menu (popover)
// ---------------------------------------------------------------------------

function AddMenu({ onSelect, onClose }: { onSelect: (type: WorkflowNode["type"]) => void; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="relative z-20 mt-1 w-56 bg-card border border-border rounded-xl shadow-lg p-2 space-y-0.5">
        {ACTION_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            onClick={() => onSelect(opt.type)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-muted transition-colors"
          >
            <opt.icon className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-[11px] font-sans font-bold text-foreground">{opt.label}</p>
              <p className="text-[10px] font-sans text-muted-foreground">{opt.description}</p>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
