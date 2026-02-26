"use client";

import { useState, useMemo } from "react";
import { Search, X, Mail, MessageSquare, Phone, Radio, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TemplateChannel = "email" | "sms" | "whatsapp" | "rcs";

interface PickedTemplate {
  id: string;
  name: string;
  subject?: string;
}

interface TemplatePickerProps {
  channel: TemplateChannel;
  currentTemplateId?: string;
  currentTemplateName?: string;
  onPick: (template: PickedTemplate) => void;
}

// ---------------------------------------------------------------------------
// Channel metadata
// ---------------------------------------------------------------------------

const CHANNEL_META: Record<TemplateChannel, { label: string; icon: typeof Mail; color: string; emptyText: string }> = {
  email: { label: "Email Templates", icon: Mail, color: "text-blue-600", emptyText: "No email templates found" },
  sms: { label: "SMS Templates", icon: MessageSquare, color: "text-purple-600", emptyText: "No SMS templates found" },
  whatsapp: { label: "WhatsApp Templates", icon: Phone, color: "text-green-600", emptyText: "No WhatsApp templates found" },
  rcs: { label: "RCS Templates", icon: Radio, color: "text-orange-600", emptyText: "No RCS templates found" },
};

// ---------------------------------------------------------------------------
// TemplatePicker (inline dialog)
// ---------------------------------------------------------------------------

export function TemplatePicker({ channel, currentTemplateId, currentTemplateName, onPick }: TemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const meta = CHANNEL_META[channel];
  const Icon = meta.icon;

  // Fetch templates based on channel type
  const { data: emailTemplates } = trpc.templates.list.useQuery(undefined, { enabled: channel === "email" });
  const { data: smsTemplates } = (trpc.templates as any).listSms?.useQuery(undefined, { enabled: channel === "sms" }) ?? { data: undefined };
  const { data: whatsAppTemplates } = (trpc.templates as any).listWhatsApp?.useQuery(undefined, { enabled: channel === "whatsapp" }) ?? { data: undefined };
  const { data: rcsTemplates } = (trpc.templates as any).listRcs?.useQuery(undefined, { enabled: channel === "rcs" }) ?? { data: undefined };

  // Normalize templates into a common shape
  const templates: PickedTemplate[] = useMemo(() => {
    switch (channel) {
      case "email":
        return (emailTemplates ?? []).map((t: any) => ({ id: t.id, name: t.name, subject: t.subject }));
      case "sms":
        return (smsTemplates ?? []).map((t: any) => ({ id: t.id, name: t.name }));
      case "whatsapp":
        return (whatsAppTemplates ?? []).map((t: any) => ({ id: t.id, name: t.name }));
      case "rcs":
        return (rcsTemplates ?? []).map((t: any) => ({ id: t.id, name: t.name }));
    }
  }, [channel, emailTemplates, smsTemplates, whatsAppTemplates, rcsTemplates]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.subject && t.subject.toLowerCase().includes(q))
    );
  }, [templates, search]);

  const displayName = currentTemplateName || "Select template...";

  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-mono font-semibold text-muted-foreground uppercase">
        Template
      </label>

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-[13px] font-mono text-left hover:border-primary/50 transition-all"
      >
        <Icon className={`w-3.5 h-3.5 ${meta.color} flex-shrink-0`} />
        <span className={`flex-1 truncate ${currentTemplateId ? "text-foreground" : "text-muted-foreground"}`}>
          {displayName}
        </span>
        {currentTemplateId && (
          <Check className="w-3 h-3 text-green-600 flex-shrink-0" />
        )}
      </button>

      {/* Picker dialog */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="relative z-50 mt-1 border border-border rounded-xl bg-card shadow-xl overflow-hidden">
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${meta.label.toLowerCase()}...`}
                className="flex-1 text-[13px] font-mono text-foreground bg-transparent outline-none placeholder:text-muted-foreground/50"
                autoFocus
              />
              {search && (
                <button onClick={() => setSearch("")} className="p-0.5 hover:bg-muted rounded">
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Header */}
            <div className="px-3 py-1.5 bg-muted border-b border-border">
              <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase">
                {meta.label} ({filtered.length})
              </span>
            </div>

            {/* List */}
            <div className="max-h-56 overflow-y-auto">
              {filtered.length > 0 ? (
                filtered.map((t) => {
                  const isSelected = t.id === currentTemplateId;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        onPick(t);
                        setOpen(false);
                        setSearch("");
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted transition-colors ${
                        isSelected ? "bg-blue-50" : ""
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${isSelected ? meta.color : "text-muted-foreground/50"} flex-shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11px] font-mono truncate ${isSelected ? "font-bold text-foreground" : "text-foreground"}`}>
                          {t.name}
                        </p>
                        {t.subject && (
                          <p className="text-[10px] font-mono text-muted-foreground truncate">{t.subject}</p>
                        )}
                      </div>
                      {isSelected && <Check className="w-3 h-3 text-blue-600 flex-shrink-0" />}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-6 text-center">
                  <p className="text-[11px] font-mono text-muted-foreground">{meta.emptyText}</p>
                  <p className="text-[10px] font-mono text-muted-foreground/50 mt-1">
                    Generate content via the AI Agent first
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
