"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Plus,
  Trash2,
  Loader2,
  Save,
  X,
  Variable,
  Smartphone,
  ArrowLeft,
  MessageCircle,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { SmartEmptyState } from "@/components/ui/SmartEmptyState";
import { useToast } from "@/components/ui/Toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Channel = "sms" | "whatsapp" | "rcs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VARIABLE_OPTIONS = [
  "{first_name}",
  "{product_name}",
  "{discount_code}",
  "{order_number}",
  "{store_name}",
];

const channelTabs: { key: Channel; label: string; icon: React.ElementType }[] = [
  { key: "sms", label: "SMS", icon: MessageSquare },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "rcs", label: "RCS", icon: Zap },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function highlightVariables(text: string): React.ReactNode[] {
  const parts = text.split(/(\{[a-z_]+\})/g);
  return parts.map((part, i) =>
    /^\{[a-z_]+\}$/.test(part) ? (
      <span key={i} className="bg-olive/15 text-olive font-semibold rounded px-0.5">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function countVariables(text: string): number {
  const matches = text.match(/\{[a-z_]+\}/g);
  return matches ? new Set(matches).size : 0;
}

function smsSegments(text: string): { chars: number; segments: number } {
  const chars = text.length;
  if (chars <= 160) return { chars, segments: 1 };
  return { chars, segments: Math.ceil(chars / 153) };
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Phone Preview Components
// ---------------------------------------------------------------------------

function SmsPreview({ content }: { content: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-[260px] h-[460px] bg-gray-100 rounded-[32px] border-[3px] border-gray-300 overflow-hidden flex flex-col">
        {/* Phone status bar */}
        <div className="h-8 bg-gray-200 flex items-center justify-center">
          <span className="text-[10px] text-gray-500 font-mono">SMS Preview</span>
        </div>
        {/* Messages area */}
        <div className="flex-1 p-3 overflow-y-auto">
          <div className="flex justify-start">
            <div className="max-w-[85%] bg-white rounded-2xl rounded-tl-sm px-3 py-2 shadow-sm border border-gray-200">
              <p className="text-[11px] text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
                {content || "Your message will appear here..."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WhatsAppPreview({
  content,
  headerType,
  headerContent,
  footerText,
  buttons,
}: {
  content: string;
  headerType: string;
  headerContent: string;
  footerText: string;
  buttons: { type: string; text: string; url?: string }[];
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-[260px] h-[460px] bg-[#e5ddd5] rounded-[32px] border-[3px] border-gray-300 overflow-hidden flex flex-col">
        {/* WhatsApp header bar */}
        <div className="h-10 bg-[#075e54] flex items-center px-3 gap-2">
          <div className="w-6 h-6 rounded-full bg-white/20" />
          <span className="text-[11px] text-white font-medium">Business</span>
        </div>
        {/* Messages area */}
        <div className="flex-1 p-3 overflow-y-auto">
          <div className="flex justify-start">
            <div className="max-w-[90%] bg-white rounded-lg rounded-tl-sm shadow-sm overflow-hidden">
              {/* Header */}
              {headerType === "text" && headerContent && (
                <div className="px-3 pt-2">
                  <p className="text-[11px] font-bold text-gray-900">{headerContent}</p>
                </div>
              )}
              {headerType === "image" && (
                <div className="w-full h-28 bg-gray-200 flex items-center justify-center">
                  <Smartphone className="w-6 h-6 text-gray-400" />
                </div>
              )}
              {/* Body */}
              <div className="px-3 py-2">
                <p className="text-[11px] text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
                  {content || "Your message will appear here..."}
                </p>
              </div>
              {/* Footer */}
              {footerText && (
                <div className="px-3 pb-1">
                  <p className="text-[10px] text-gray-400">{footerText}</p>
                </div>
              )}
              {/* Time */}
              <div className="px-3 pb-1 flex justify-end">
                <span className="text-[9px] text-gray-400">12:00 PM</span>
              </div>
              {/* Buttons */}
              {buttons.length > 0 && (
                <div className="border-t border-gray-100">
                  {buttons.map((btn, i) => (
                    <div
                      key={i}
                      className="text-center text-[11px] text-[#075e54] font-medium py-2 border-b border-gray-100 last:border-0"
                    >
                      {btn.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RcsPreview({
  content,
  cardTitle,
  actions,
}: {
  content: string;
  cardTitle: string;
  actions: { type: string; text: string; url?: string }[];
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-[260px] h-[460px] bg-gray-50 rounded-[32px] border-[3px] border-gray-300 overflow-hidden flex flex-col">
        {/* Status bar */}
        <div className="h-8 bg-blue-600 flex items-center justify-center">
          <span className="text-[10px] text-white font-mono">RCS Preview</span>
        </div>
        {/* Messages */}
        <div className="flex-1 p-3 overflow-y-auto">
          <div className="flex justify-start">
            <div className="max-w-[90%] bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
              {/* Rich card */}
              {cardTitle && (
                <div className="px-3 pt-3">
                  <p className="text-[12px] font-bold text-gray-900">{cardTitle}</p>
                </div>
              )}
              {/* Body */}
              <div className="px-3 py-2">
                <p className="text-[11px] text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
                  {content || "Your message will appear here..."}
                </p>
              </div>
              {/* Actions */}
              {actions.length > 0 && (
                <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                  {actions.map((action, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-medium border border-blue-100"
                    >
                      {action.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template Card
// ---------------------------------------------------------------------------

function TemplateCard({
  channel,
  template,
  onEdit,
  onDelete,
  isDeleting,
}: {
  channel: Channel;
  template: any;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const body = template.body ?? "";
  const vars = countVariables(body);
  const gradientMap: Record<Channel, string> = {
    sms: "bg-gradient-to-r from-blue-50 to-blue-100/50",
    whatsapp: "bg-gradient-to-r from-green-50 to-green-100/50",
    rcs: "bg-gradient-to-r from-purple-50 to-purple-100/50",
  };
  const badgeMap: Record<Channel, string> = {
    sms: "bg-blue-100 text-blue-700 border-blue-200",
    whatsapp: "bg-green-100 text-green-700 border-green-200",
    rcs: "bg-purple-100 text-purple-700 border-purple-200",
  };

  return (
    <motion.div
      variants={itemVariants}
      className="glass-card rounded-xl overflow-hidden hover:shadow-lg transition-all group"
    >
      {/* Header strip */}
      <div className={`h-16 ${gradientMap[channel]} flex items-center justify-center`}>
        <MessageSquare className="w-5 h-5 text-foreground/15" />
      </div>

      <div className="p-4 space-y-3">
        <h3 className="text-[13px] font-bold text-foreground font-mono leading-snug line-clamp-1">
          {template.name}
        </h3>

        {/* Content preview */}
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
          {body.length > 120 ? body.slice(0, 120) + "..." : body || "No content"}
        </p>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 text-[10px] font-mono rounded-md border ${badgeMap[channel]}`}>
            {channel.toUpperCase()}
          </span>
          {channel === "sms" && (
            <span className="px-2 py-0.5 text-[10px] font-mono rounded-md bg-muted text-muted-foreground border border-border">
              {body.length} chars / {smsSegments(body).segments} seg
            </span>
          )}
          {vars > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-mono rounded-md bg-olive/10 text-olive border border-olive/20">
              {vars} var{vars > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Date + actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <span className="text-[10px] text-muted-foreground/60 font-mono">
            {formatDate(template.createdAt)}
          </span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              className="px-2 py-1 rounded-lg text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-white/20 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="p-1.5 rounded-lg hover:bg-white/20 text-muted-foreground hover:text-red-600 disabled:opacity-50 transition-colors"
            >
              {isDeleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// WhatsApp Buttons Editor
// ---------------------------------------------------------------------------

function ButtonsEditor({
  buttons,
  onChange,
}: {
  buttons: { type: string; text: string; url?: string }[];
  onChange: (btns: { type: string; text: string; url?: string }[]) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
        Buttons
      </label>
      {buttons.map((btn, i) => (
        <div key={i} className="flex gap-2 items-center">
          <select
            value={btn.type}
            onChange={(e) => {
              const updated = [...buttons];
              updated[i] = { ...btn, type: e.target.value };
              onChange(updated);
            }}
            className="px-2 py-1.5 bg-white/20 border border-border rounded-lg text-[11px] font-mono text-foreground"
          >
            <option value="quick_reply">Quick Reply</option>
            <option value="url">URL</option>
            <option value="phone">Phone</option>
          </select>
          <input
            type="text"
            value={btn.text}
            onChange={(e) => {
              const updated = [...buttons];
              updated[i] = { ...btn, text: e.target.value };
              onChange(updated);
            }}
            placeholder="Button text"
            className="flex-1 px-2 py-1.5 bg-white/20 border border-border rounded-lg text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50"
          />
          {btn.type === "url" && (
            <input
              type="text"
              value={btn.url || ""}
              onChange={(e) => {
                const updated = [...buttons];
                updated[i] = { ...btn, url: e.target.value };
                onChange(updated);
              }}
              placeholder="https://..."
              className="flex-1 px-2 py-1.5 bg-white/20 border border-border rounded-lg text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50"
            />
          )}
          <button
            onClick={() => onChange(buttons.filter((_, j) => j !== i))}
            className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      {buttons.length < 3 && (
        <button
          onClick={() => onChange([...buttons, { type: "quick_reply", text: "" }])}
          className="text-[11px] font-mono text-olive hover:underline"
        >
          + Add button
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RCS Actions Editor
// ---------------------------------------------------------------------------

function ActionsEditor({
  actions,
  onChange,
}: {
  actions: { type: string; text: string; url?: string }[];
  onChange: (a: { type: string; text: string; url?: string }[]) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
        Suggested Actions
      </label>
      {actions.map((action, i) => (
        <div key={i} className="flex gap-2 items-center">
          <select
            value={action.type}
            onChange={(e) => {
              const updated = [...actions];
              updated[i] = { ...action, type: e.target.value };
              onChange(updated);
            }}
            className="px-2 py-1.5 bg-white/20 border border-border rounded-lg text-[11px] font-mono text-foreground"
          >
            <option value="reply">Reply</option>
            <option value="url">Open URL</option>
            <option value="dial">Dial</option>
          </select>
          <input
            type="text"
            value={action.text}
            onChange={(e) => {
              const updated = [...actions];
              updated[i] = { ...action, text: e.target.value };
              onChange(updated);
            }}
            placeholder="Action text"
            className="flex-1 px-2 py-1.5 bg-white/20 border border-border rounded-lg text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50"
          />
          {action.type === "url" && (
            <input
              type="text"
              value={action.url || ""}
              onChange={(e) => {
                const updated = [...actions];
                updated[i] = { ...action, url: e.target.value };
                onChange(updated);
              }}
              placeholder="https://..."
              className="flex-1 px-2 py-1.5 bg-white/20 border border-border rounded-lg text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50"
            />
          )}
          <button
            onClick={() => onChange(actions.filter((_, j) => j !== i))}
            className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      {actions.length < 4 && (
        <button
          onClick={() => onChange([...actions, { type: "reply", text: "" }])}
          className="text-[11px] font-mono text-olive hover:underline"
        >
          + Add action
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template Editor
// ---------------------------------------------------------------------------

function TemplateEditor({
  channel,
  existingTemplate,
  onClose,
  onSaved,
}: {
  channel: Channel;
  existingTemplate?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!existingTemplate;

  // Shared fields
  const [name, setName] = useState(existingTemplate?.name ?? "");
  const [content, setContent] = useState(existingTemplate?.body ?? "");

  // WhatsApp-specific
  const waVars = existingTemplate?.variables ?? {};
  const [headerType, setHeaderType] = useState<string>(waVars.headerType ?? "none");
  const [headerContent, setHeaderContent] = useState(waVars.headerContent ?? "");
  const [footerText, setFooterText] = useState(waVars.footerText ?? "");
  const [buttons, setButtons] = useState<{ type: string; text: string; url?: string }[]>(
    waVars.buttons ?? []
  );

  // RCS-specific
  const [cardTitle, setCardTitle] = useState(existingTemplate?.cardTitle ?? "");
  const [cardImageUrl] = useState(existingTemplate?.cardImageUrl ?? "");
  const [actions, setActions] = useState<{ type: string; text: string; url?: string }[]>(
    Array.isArray(existingTemplate?.actions) ? existingTemplate.actions : []
  );

  // Extract variables from content
  const extractedVars = useMemo((): string[] => {
    const matches = content.match(/\{[a-z_]+\}/g);
    return matches ? Array.from(new Set(matches)) as string[] : [];
  }, [content]);

  const insertVariable = useCallback(
    (v: string) => {
      setContent((prev: string) => prev + v);
    },
    []
  );

  // Mutations
  const createSmsMut = trpc.templates.createSms.useMutation({
    onSuccess: () => { toast("SMS template created", "success"); onSaved(); },
    onError: () => toast("Failed to create template", "error"),
  });
  const updateSmsMut = trpc.templates.updateSms.useMutation({
    onSuccess: () => { toast("SMS template updated", "success"); onSaved(); },
    onError: () => toast("Failed to update template", "error"),
  });
  const createWaMut = trpc.templates.createWhatsApp.useMutation({
    onSuccess: () => { toast("WhatsApp template created", "success"); onSaved(); },
    onError: () => toast("Failed to create template", "error"),
  });
  const updateWaMut = trpc.templates.updateWhatsApp.useMutation({
    onSuccess: () => { toast("WhatsApp template updated", "success"); onSaved(); },
    onError: () => toast("Failed to update template", "error"),
  });
  const createRcsMut = trpc.templates.createRcs.useMutation({
    onSuccess: () => { toast("RCS template created", "success"); onSaved(); },
    onError: () => toast("Failed to create template", "error"),
  });
  const updateRcsMut = trpc.templates.updateRcs.useMutation({
    onSuccess: () => { toast("RCS template updated", "success"); onSaved(); },
    onError: () => toast("Failed to update template", "error"),
  });

  const isSaving =
    createSmsMut.isPending ||
    updateSmsMut.isPending ||
    createWaMut.isPending ||
    updateWaMut.isPending ||
    createRcsMut.isPending ||
    updateRcsMut.isPending;

  const handleSave = () => {
    if (!name.trim()) {
      toast("Name is required", "error");
      return;
    }
    if (!content.trim()) {
      toast("Content is required", "error");
      return;
    }

    if (channel === "sms") {
      if (isEditing) {
        updateSmsMut.mutate({ id: existingTemplate.id, name, content, variables: extractedVars });
      } else {
        createSmsMut.mutate({ name, content, variables: extractedVars });
      }
    } else if (channel === "whatsapp") {
      if (isEditing) {
        updateWaMut.mutate({
          id: existingTemplate.id,
          name,
          content,
          headerType: headerType as any,
          headerContent,
          footerText,
          buttons,
          variables: extractedVars,
        });
      } else {
        createWaMut.mutate({
          name,
          content,
          headerType: headerType as any,
          headerContent,
          footerText,
          buttons,
          variables: extractedVars,
        });
      }
    } else if (channel === "rcs") {
      if (isEditing) {
        updateRcsMut.mutate({
          id: existingTemplate.id,
          name,
          content,
          cardTitle: cardTitle || undefined,
          cardImageUrl: cardImageUrl || undefined,
          actions,
          variables: extractedVars,
        });
      } else {
        createRcsMut.mutate({
          name,
          content,
          cardTitle: cardTitle || undefined,
          cardImageUrl: cardImageUrl || undefined,
          actions,
          variables: extractedVars,
        });
      }
    }
  };

  const seg = smsSegments(content);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3 }}
      className="glass-card rounded-xl p-6 space-y-6"
    >
      {/* Editor header */}
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-bold font-mono text-foreground">
          {isEditing ? "Edit" : "New"} {channel.toUpperCase()} Template
        </h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Form */}
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">
              Template Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Welcome SMS, Order Confirmation"
              className="w-full px-3 py-2.5 bg-white/20 border border-border rounded-lg text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors"
            />
          </div>

          {/* WhatsApp header */}
          {channel === "whatsapp" && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Header Type
                </label>
                <select
                  value={headerType}
                  onChange={(e) => setHeaderType(e.target.value)}
                  className="w-full px-3 py-2 bg-white/20 border border-border rounded-lg text-[12px] font-mono text-foreground"
                >
                  <option value="none">None</option>
                  <option value="text">Text</option>
                  <option value="image">Image</option>
                  <option value="document">Document</option>
                </select>
              </div>
              {headerType === "text" && (
                <input
                  type="text"
                  value={headerContent}
                  onChange={(e) => setHeaderContent(e.target.value)}
                  placeholder="Header text..."
                  className="w-full px-3 py-2 bg-white/20 border border-border rounded-lg text-[12px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors"
                />
              )}
            </div>
          )}

          {/* RCS card title */}
          {channel === "rcs" && (
            <div>
              <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">
                Card Title (optional)
              </label>
              <input
                type="text"
                value={cardTitle}
                onChange={(e) => setCardTitle(e.target.value)}
                placeholder="Rich card title..."
                className="w-full px-3 py-2.5 bg-white/20 border border-border rounded-lg text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors"
              />
            </div>
          )}

          {/* Content */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                Message Content
              </label>
              {channel === "sms" && (
                <span className={`text-[10px] font-mono ${seg.chars > 1600 ? "text-red-500" : "text-muted-foreground"}`}>
                  {seg.chars}/1600 chars &middot; {seg.segments} segment{seg.segments !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              maxLength={channel === "sms" ? 1600 : undefined}
              placeholder="Type your message here..."
              className="w-full px-3 py-2.5 bg-white/20 border border-border rounded-lg text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors resize-none"
            />
            {/* Content preview with highlighted variables */}
            {content && (
              <div className="mt-2 px-3 py-2 bg-muted/30 rounded-lg text-[11px] font-mono leading-relaxed text-foreground/80 whitespace-pre-wrap">
                {highlightVariables(content)}
              </div>
            )}
          </div>

          {/* Variable insertion */}
          <div>
            <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">
              <Variable className="w-3 h-3 inline mr-1" />
              Insert Variable
            </label>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLE_OPTIONS.map((v) => (
                <button
                  key={v}
                  onClick={() => insertVariable(v)}
                  className="px-2 py-1 rounded-md bg-olive/10 text-olive border border-olive/20 text-[10px] font-mono hover:bg-olive/20 transition-colors"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* WhatsApp footer */}
          {channel === "whatsapp" && (
            <div>
              <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider block mb-1.5">
                Footer Text (optional)
              </label>
              <input
                type="text"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder="Footer text..."
                className="w-full px-3 py-2 bg-white/20 border border-border rounded-lg text-[12px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors"
              />
            </div>
          )}

          {/* WhatsApp buttons */}
          {channel === "whatsapp" && (
            <ButtonsEditor buttons={buttons} onChange={setButtons} />
          )}

          {/* RCS actions */}
          {channel === "rcs" && (
            <ActionsEditor actions={actions} onChange={setActions} />
          )}
        </div>

        {/* Right: Preview */}
        <div className="flex flex-col items-center justify-start pt-4">
          <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-4">
            Live Preview
          </label>
          {channel === "sms" && <SmsPreview content={content} />}
          {channel === "whatsapp" && (
            <WhatsAppPreview
              content={content}
              headerType={headerType}
              headerContent={headerContent}
              footerText={footerText}
              buttons={buttons}
            />
          )}
          {channel === "rcs" && (
            <RcsPreview content={content} cardTitle={cardTitle} actions={actions} />
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40">
        <button
          onClick={onClose}
          className="px-4 py-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || !name.trim() || !content.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono hover:bg-secondary/90 transition-all disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {isEditing ? "Update" : "Create"} Template
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function ChannelTemplatesPage() {
  const { toast } = useToast();
  const [activeChannel, setActiveChannel] = useState<Channel>("sms");
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [showEditor, setShowEditor] = useState(false);

  const utils = trpc.useUtils();

  // Queries
  const smsQuery = trpc.templates.listSms.useQuery();
  const waQuery = trpc.templates.listWhatsApp.useQuery();
  const rcsQuery = trpc.templates.listRcs.useQuery();

  // Delete mutations
  const deleteSmsMut = trpc.templates.deleteSms.useMutation({
    onSuccess: () => { utils.templates.listSms.invalidate(); toast("SMS template deleted", "success"); },
    onError: () => toast("Failed to delete", "error"),
  });
  const deleteWaMut = trpc.templates.deleteWhatsApp.useMutation({
    onSuccess: () => { utils.templates.listWhatsApp.invalidate(); toast("WhatsApp template deleted", "success"); },
    onError: () => toast("Failed to delete", "error"),
  });
  const deleteRcsMut = trpc.templates.deleteRcs.useMutation({
    onSuccess: () => { utils.templates.listRcs.invalidate(); toast("RCS template deleted", "success"); },
    onError: () => toast("Failed to delete", "error"),
  });

  const currentQuery: { data: any; isLoading: boolean } =
    activeChannel === "sms" ? smsQuery as any : activeChannel === "whatsapp" ? waQuery as any : rcsQuery as any;
  const templates = currentQuery.data ?? [];
  const isLoading = currentQuery.isLoading;

  const handleDelete = (id: string) => {
    if (activeChannel === "sms") deleteSmsMut.mutate({ id });
    else if (activeChannel === "whatsapp") deleteWaMut.mutate({ id });
    else deleteRcsMut.mutate({ id });
  };

  const handleEdit = (template: any) => {
    setEditingTemplate(template);
    setShowEditor(true);
  };

  const handleNewTemplate = () => {
    setEditingTemplate(null);
    setShowEditor(true);
  };

  const handleSaved = () => {
    setShowEditor(false);
    setEditingTemplate(null);
    if (activeChannel === "sms") utils.templates.listSms.invalidate();
    else if (activeChannel === "whatsapp") utils.templates.listWhatsApp.invalidate();
    else utils.templates.listRcs.invalidate();
  };

  const isDeleting = deleteSmsMut.isPending || deleteWaMut.isPending || deleteRcsMut.isPending;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link
              href="/templates"
              className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to Email Templates
            </Link>
          </div>
          <h1 className="section-header accent-bar-left text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">
            Channel templates
          </h1>
          <p className="text-[13px] text-muted-foreground font-sans mt-1">
            SMS, WhatsApp, and RCS message templates
          </p>
        </div>
        <button
          onClick={handleNewTemplate}
          className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono hover:bg-secondary/90 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          New Template
        </button>
      </div>

      {/* Channel Tabs */}
      <div className="flex items-center gap-1 bg-white/10 border border-border rounded-lg p-1">
        {channelTabs.map((tab) => {
          const Icon = tab.icon;
          const count =
            tab.key === "sms"
              ? smsQuery.data?.length ?? 0
              : tab.key === "whatsapp"
              ? waQuery.data?.length ?? 0
              : rcsQuery.data?.length ?? 0;

          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveChannel(tab.key);
                setShowEditor(false);
                setEditingTemplate(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-mono transition-all flex-1 justify-center ${
                activeChannel === tab.key
                  ? "bg-secondary text-secondary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/10"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {count > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[9px] rounded-full bg-foreground/10">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Editor */}
      <AnimatePresence mode="wait">
        {showEditor && (
          <TemplateEditor
            key={`editor-${activeChannel}-${editingTemplate?.id ?? "new"}`}
            channel={activeChannel}
            existingTemplate={editingTemplate}
            onClose={() => {
              setShowEditor(false);
              setEditingTemplate(null);
            }}
            onSaved={handleSaved}
          />
        )}
      </AnimatePresence>

      {/* Template list */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 glass-skeleton rounded-xl" />
          ))}
        </div>
      ) : templates.length > 0 ? (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {templates.map((template: any) => (
            <TemplateCard
              key={template.id}
              channel={activeChannel}
              template={template}
              onEdit={() => handleEdit(template)}
              onDelete={() => handleDelete(template.id)}
              isDeleting={isDeleting}
            />
          ))}
        </motion.div>
      ) : !showEditor ? (
        <SmartEmptyState
          icon={MessageSquare}
          title={`No ${activeChannel.toUpperCase()} templates yet`}
          description={`Create your first ${activeChannel.toUpperCase()} template to start sending messages.`}
          actions={[
            {
              label: `Create ${activeChannel.toUpperCase()} Template`,
              primary: true,
              onClick: handleNewTemplate,
            },
          ]}
        />
      ) : null}
    </div>
  );
}
