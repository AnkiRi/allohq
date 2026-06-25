"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Store, User, Bell, CreditCard, Sparkles, Cpu, Check, Activity, MessageSquare, BookOpen, Plus, Pencil, Trash2, X } from "lucide-react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { AppearanceSetting } from "@/components/settings/AppearanceSetting";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const TIER_COLORS: Record<string, { color: string; label: string }> = {
  premium: { color: "var(--color-accent)", label: "Premium" },
  standard: { color: "var(--color-info)", label: "Standard" },
  economy: { color: "var(--color-success)", label: "Economy" },
};

const TOKEN_PERIODS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "180d", label: "180 Days" },
  { value: "1y", label: "1 Year" },
  { value: "all", label: "All Time" },
] as const;

const MODEL_LABELS: Record<string, string> = {
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o Mini",
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function getCostComparison(cost: number): string {
  if (cost === 0) return "Nothing spent yet. allo is just getting started";
  if (cost < 0.01) return "Less than a rounding error";
  if (cost < 0.10) return "Less than a small piece of candy";
  if (cost < 1.00) return "Less than a cup of coffee";
  if (cost < 5.00) return "About the price of a coffee";
  if (cost < 20.00) return "Less than a nice lunch";
  return "allo has been hard at work for you";
}

function TokenUsageSection() {
  const [period, setPeriod] = useState<string>("30d");

  const { data: usage, isLoading } = (trpc.dashboard as any).tokenUsage.useQuery(
    { period },
  ) as { data: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCalls: number;
    totalCost: number;
    byModel: { model: string; inputTokens: number; outputTokens: number; calls: number; cost: number }[];
  } | undefined; isLoading: boolean };

  return (
    <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
      <div className="flex items-center gap-3 mb-2">
        <Activity className="w-4 h-4 text-muted-foreground" />
        <h2 className="section-header accent-bar-left text-[13px]">AI usage</h2>
      </div>

      {/* Human-readable summary */}
      {usage && (
        <div className="mb-5">
          <p className="text-[20px] tracking-[-0.5px] font-bold text-foreground">
            allo cost you ${usage.totalCost.toFixed(4)} this period
          </p>
          <p className="text-[12px] text-muted-foreground font-sans mt-1">
            {getCostComparison(usage.totalCost)}
          </p>
        </div>
      )}

      {/* Period selector */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {TOKEN_PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-sans transition-colors ${
              period === p.value
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 glass-skeleton rounded-xl" />
          ))}
        </div>
      ) : usage ? (
        <>
          {/* Summary bar */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: "Total cost", value: `$${usage.totalCost.toFixed(4)}` },
              { label: "Requests", value: String(usage.totalCalls) },
              { label: "Input tokens", value: formatTokens(usage.totalInputTokens) },
              { label: "Output tokens", value: formatTokens(usage.totalOutputTokens) },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl bg-muted border border-border p-3">
                <div className="font-sans text-[10px] uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </div>
                <div className="font-mono text-[16px] font-bold text-foreground mt-0.5">
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Per-model breakdown */}
          {usage.byModel.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">By model</p>
              {usage.byModel.map((m) => (
                <div
                  key={m.model}
                  className="flex items-center justify-between p-3 bg-muted border border-border rounded-lg"
                >
                  <div>
                    <p className="text-[12px] font-bold text-foreground">
                      {MODEL_LABELS[m.model] ?? m.model}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {m.calls} requests · {formatTokens(m.inputTokens)} in · {formatTokens(m.outputTokens)} out
                    </p>
                  </div>
                  <span className="text-[13px] font-bold font-mono text-foreground">
                    ${m.cost.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-[11px] text-muted-foreground">
                Nothing yet for this period. allo hasn&apos;t needed to spend here.
              </p>
            </div>
          )}
        </>
      ) : null}
    </motion.div>
  );
}

const CHANNELS = [
  { key: "smsProvider" as const, label: "SMS", desc: "Text messages" },
  { key: "whatsappProvider" as const, label: "WhatsApp", desc: "WhatsApp Business messages" },
  { key: "rcsProvider" as const, label: "RCS", desc: "Rich Communication Services" },
];

const PROVIDERS = [
  { value: "twilio", label: "Twilio", desc: "Global coverage, US-based" },
  { value: "gupshup", label: "Gupshup", desc: "India-optimized, DLT compliant" },
];

const KB_CATEGORIES = [
  { value: "policy", label: "Policy" },
  { value: "faq", label: "FAQ" },
  { value: "shipping", label: "Shipping" },
  { value: "returns", label: "Returns" },
  { value: "product_info", label: "Product Info" },
  { value: "general", label: "General" },
];

function KnowledgeBaseSection({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const [filterCategory, setFilterCategory] = useState<string | undefined>();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState("faq");

  const { data: articles, refetch } = (trpc.knowledge as any).list.useQuery(
    { storeId, category: filterCategory },
    { enabled: !!storeId },
  ) as {
    data: Array<{ id: string; category: string; title: string; content: string; isActive: boolean; updatedAt: string }> | undefined;
    refetch: () => void;
  };

  const createMut = (trpc.knowledge as any).create.useMutation({
    onSuccess: () => { toast("Article saved. allo can use it now.", "success"); resetForm(); refetch(); },
    onError: (err: { message?: string }) => toast(err.message || "Something went wrong. Please try again.", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const updateMut = (trpc.knowledge as any).update.useMutation({
    onSuccess: () => { toast("Article updated.", "success"); resetForm(); refetch(); },
    onError: (err: { message?: string }) => toast(err.message || "Something went wrong. Please try again.", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const deleteMut = (trpc.knowledge as any).delete.useMutation({
    onSuccess: () => { toast("Article removed.", "success"); refetch(); },
    onError: (err: { message?: string }) => toast(err.message || "Something went wrong. Please try again.", "error"),
  }) as { mutate: (input: { id: string }) => void; isPending: boolean };

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setFormTitle("");
    setFormContent("");
    setFormCategory("faq");
  }

  function startEdit(article: { id: string; title: string; content: string; category: string }) {
    setEditId(article.id);
    setFormTitle(article.title);
    setFormContent(article.content);
    setFormCategory(article.category);
    setShowForm(true);
  }

  function handleSubmit() {
    if (!formTitle.trim() || !formContent.trim()) return;
    if (editId) {
      updateMut.mutate({ id: editId, title: formTitle, content: formContent, category: formCategory });
    } else {
      createMut.mutate({ storeId, title: formTitle, content: formContent, category: formCategory });
    }
  }

  return (
    <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <BookOpen className="w-4 h-4 text-muted-foreground" />
        <h2 className="section-header accent-bar-left text-[13px]">Knowledge base</h2>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="ml-auto text-[10px] font-sans px-2 py-1 rounded bg-[hsl(var(--accent-bg))] text-[hsl(var(--accent))] hover:opacity-80 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add article
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        Add your policies, FAQs, and product details so allo can answer customer questions the way you would.
      </p>

      {/* Category filter */}
      <div className="flex gap-1 mb-4 flex-wrap">
        <button
          onClick={() => setFilterCategory(undefined)}
          className={`px-2 py-1 rounded text-[10px] font-sans ${!filterCategory ? "bg-foreground text-background" : "bg-foreground/5 text-muted-foreground hover:bg-foreground/10"}`}
        >
          All
        </button>
        {KB_CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setFilterCategory(cat.value)}
            className={`px-2 py-1 rounded text-[10px] font-sans ${filterCategory === cat.value ? "bg-foreground text-background" : "bg-foreground/5 text-muted-foreground hover:bg-foreground/10"}`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="mb-4 p-4 rounded-lg border border-border bg-foreground/3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-sans font-bold">{editId ? "Edit article" : "New article"}</span>
            <button onClick={resetForm} className="p-1 hover:bg-foreground/5 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <select
            value={formCategory}
            onChange={(e) => setFormCategory(e.target.value)}
            className="w-full text-[11px] font-sans px-3 py-1.5 rounded border border-border bg-background outline-none"
          >
            {KB_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder="Give this article a title..."
            className="w-full text-[11px] font-sans px-3 py-1.5 rounded border border-border bg-background outline-none"
          />
          <textarea
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            placeholder="Article content: policies, FAQs, product details..."
            rows={4}
            className="w-full text-[11px] font-sans px-3 py-1.5 rounded border border-border bg-background outline-none resize-y"
          />
          <button
            onClick={handleSubmit}
            disabled={!formTitle.trim() || !formContent.trim() || createMut.isPending || updateMut.isPending}
            className="text-[10px] font-sans px-3 py-1.5 rounded bg-foreground text-background disabled:opacity-40"
          >
            {editId ? "Update" : "Create"}
          </button>
        </div>
      )}

      {/* Articles list */}
      {!articles?.length && !showForm && (
        <div className="text-center py-6 text-muted-foreground text-[11px] font-sans">
          No articles yet. Add a few policies and FAQs so allo can answer customers well.
        </div>
      )}
      <div className="space-y-2">
        {articles?.map((article) => (
          <div key={article.id} className="p-3 rounded-lg border border-border bg-background/60">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-sans bg-foreground/5 text-muted-foreground">
                    {article.category}
                  </span>
                  <span className="text-[12px] font-semibold truncate">{article.title}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{article.content}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => startEdit(article)}
                  className="p-1.5 hover:bg-foreground/5 rounded"
                >
                  <Pencil className="w-3 h-3 text-muted-foreground" />
                </button>
                <button
                  onClick={() => deleteMut.mutate({ id: article.id })}
                  disabled={deleteMut.isPending}
                  className="p-1.5 hover:bg-destructive/10 rounded"
                >
                  <Trash2 className="w-3 h-3 text-destructive/60" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function MessagingConfigSection({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: config, isLoading } = (trpc.stores as any).getMessagingConfig.useQuery(
    { storeId },
    { enabled: !!storeId }
  ) as { data: { smsProvider: string | null; whatsappProvider: string | null; rcsProvider: string | null } | undefined; isLoading: boolean };

  const updateConfig = (trpc.stores as any).updateMessagingConfig.useMutation({
    onSuccess: () => {
      toast("Messaging provider updated.", "success");
      (utils.stores as any).getMessagingConfig.invalidate({ storeId });
    },
    onError: (err: { message?: string }) => toast(err.message || "Couldn't save that. Please try again.", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  if (!storeId) return null;

  return (
    <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <MessageSquare className="w-4 h-4 text-muted-foreground" />
        <h2 className="section-header accent-bar-left text-[13px]">Messaging providers</h2>
      </div>
      <p className="text-[11px] text-muted-foreground mb-5">
        Pick who delivers each channel for this store. If you leave it on Default, allo uses Twilio.
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 glass-skeleton rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {CHANNELS.map((ch) => {
            const current = config?.[ch.key] ?? null;
            return (
              <div key={ch.key}>
                <label className="block text-[11px] text-muted-foreground font-sans mb-2">
                  {ch.label} <span className="text-muted-foreground/50">· {ch.desc}</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {/* Default (env/global) option */}
                  <button
                    onClick={() => updateConfig.mutate({ storeId, [ch.key]: null })}
                    disabled={updateConfig.isPending}
                    className={`relative text-left p-3 rounded-xl transition-all ${
                      current === null
                        ? "border border-[var(--terracotta)] shadow-[0_0_0_1px_var(--terracotta)] bg-muted"
                        : "border border-border bg-muted hover:border-border"
                    }`}
                  >
                    {current === null && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--olive)" }}>
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    <p className="text-[11px] font-bold text-foreground">Default</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Let allo choose</p>
                  </button>
                  {PROVIDERS.map((prov) => {
                    const isSelected = current === prov.value;
                    return (
                      <button
                        key={prov.value}
                        onClick={() => updateConfig.mutate({ storeId, [ch.key]: prov.value })}
                        disabled={updateConfig.isPending}
                        className={`relative text-left p-3 rounded-xl transition-all ${
                          isSelected
                            ? "border border-[var(--terracotta)] shadow-[0_0_0_1px_var(--terracotta)] bg-muted"
                            : "border border-border bg-muted hover:border-border"
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--olive)" }}>
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                        <p className="text-[11px] font-bold text-foreground">{prov.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{prov.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function NotificationPreferencesSection() {
  const { toast } = useToast();
  const { data: prefs, isLoading } = trpc.notifications.getPreferences.useQuery();
  const utils = trpc.useUtils();
  const upsert = trpc.notifications.upsertPreferences.useMutation({
    onSuccess: () => {
      utils.notifications.getPreferences.invalidate();
      toast("Your notification preferences are saved.", "success");
    },
    onError: (err) => toast(err.message, "error"),
  });

  const toggle = (field: string, value: boolean) => {
    upsert.mutate({ [field]: value });
  };

  const channels = [
    { key: "emailDigest", label: "Daily email digest", desc: "One email a day with everything that happened" },
    { key: "emailRealtime", label: "Real-time email", desc: "An email the moment something happens" },
    { key: "inApp", label: "In-app notifications", desc: "Updates right here in your dashboard" },
  ] as const;

  const events = [
    { key: "onActionRequired", label: "Needs your approval", desc: "allo wants your sign-off before acting" },
    { key: "onCampaignSent", label: "Campaign sent", desc: "A campaign finished going out" },
    { key: "onEscalation", label: "Escalations", desc: "A conversation needs a human" },
    { key: "onChurnAlert", label: "Churn alerts", desc: "A customer looks at risk of leaving" },
    { key: "onRevenueGoal", label: "Revenue milestones", desc: "You hit a revenue goal" },
    { key: "onWeeklyReport", label: "Weekly report", desc: "Your performance recap for the week" },
  ] as const;

  if (isLoading) {
    return (
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <h2 className="section-header accent-bar-left text-[13px]">Notifications</h2>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 glass-skeleton rounded-lg" />)}
        </div>
      </motion.div>
    );
  }

  // Use defaults if no preferences saved yet
  const p = {
    emailDigest: prefs?.emailDigest ?? true,
    emailRealtime: prefs?.emailRealtime ?? false,
    inApp: prefs?.inApp ?? true,
    onActionRequired: prefs?.onActionRequired ?? true,
    onCampaignSent: prefs?.onCampaignSent ?? true,
    onEscalation: prefs?.onEscalation ?? true,
    onChurnAlert: prefs?.onChurnAlert ?? true,
    onRevenueGoal: prefs?.onRevenueGoal ?? false,
    onWeeklyReport: prefs?.onWeeklyReport ?? true,
    quietHoursStart: prefs?.quietHoursStart ?? null,
    quietHoursEnd: prefs?.quietHoursEnd ?? null,
    timezone: prefs?.timezone ?? "UTC",
  };

  return (
    <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <Bell className="w-4 h-4 text-muted-foreground" />
        <h2 className="section-header accent-bar-left text-[13px]">Notifications</h2>
      </div>

      {/* Channels */}
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Delivery Channels</p>
      <div className="space-y-2 mb-6">
        {channels.map((ch) => (
          <button
            key={ch.key}
            onClick={() => toggle(ch.key, !p[ch.key])}
            disabled={upsert.isPending}
            className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:border-border transition-all"
          >
            <div className="text-left">
              <p className="text-[11px] font-bold text-foreground">{ch.label}</p>
              <p className="text-[10px] text-muted-foreground">{ch.desc}</p>
            </div>
            <div className={`w-9 h-5 rounded-full transition-colors relative ${p[ch.key] ? "bg-[var(--olive)]" : "bg-muted"}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${p[ch.key] ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
          </button>
        ))}
      </div>

      {/* Events */}
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Event Types</p>
      <div className="space-y-2 mb-6">
        {events.map((ev) => (
          <button
            key={ev.key}
            onClick={() => toggle(ev.key, !p[ev.key])}
            disabled={upsert.isPending}
            className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:border-border transition-all"
          >
            <div className="text-left">
              <p className="text-[11px] font-bold text-foreground">{ev.label}</p>
              <p className="text-[10px] text-muted-foreground">{ev.desc}</p>
            </div>
            <div className={`w-9 h-5 rounded-full transition-colors relative ${p[ev.key] ? "bg-[var(--olive)]" : "bg-muted"}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${p[ev.key] ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
          </button>
        ))}
      </div>

      {/* Quiet Hours */}
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Quiet Hours</p>
      <div className="flex items-center gap-3">
        <select
          value={p.quietHoursStart ?? ""}
          onChange={(e) => upsert.mutate({ quietHoursStart: e.target.value === "" ? null : Number(e.target.value) })}
          className="bg-muted border border-border rounded-lg px-3 py-2 text-[11px] font-mono text-foreground"
        >
          <option value="">Off</option>
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i}>{i.toString().padStart(2, "0")}:00</option>
          ))}
        </select>
        <span className="text-[10px] text-muted-foreground font-sans">to</span>
        <select
          value={p.quietHoursEnd ?? ""}
          onChange={(e) => upsert.mutate({ quietHoursEnd: e.target.value === "" ? null : Number(e.target.value) })}
          className="bg-muted border border-border rounded-lg px-3 py-2 text-[11px] font-mono text-foreground"
        >
          <option value="">Off</option>
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i}>{i.toString().padStart(2, "0")}:00</option>
          ))}
        </select>
        <select
          value={p.timezone}
          onChange={(e) => upsert.mutate({ timezone: e.target.value })}
          className="bg-muted border border-border rounded-lg px-3 py-2 text-[11px] font-sans text-foreground"
        >
          {["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Asia/Kolkata", "Australia/Sydney"].map((tz) => (
            <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
          ))}
        </select>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        allo stays quiet during these hours. Urgent escalations still come through.
      </p>
    </motion.div>
  );
}

function SuppressionStatsSection() {
  const [days, setDays] = useState(7);
  const { data } = (trpc.dashboard.suppressionStats as any).useQuery(
    { days },
    { refetchInterval: 60000 },
  ) as { data: { suppressed: number; sent: number; byReason: { reason: string; count: number }[] } | undefined };

  const suppressed = data?.suppressed ?? 0;
  const sent = data?.sent ?? 0;
  const total = suppressed + sent;
  const pct = total > 0 ? Math.round((suppressed / total) * 100) : 0;

  return (
    <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Activity className="w-4 h-4 text-[var(--color-success)]" />
          <h2 className="section-header accent-bar-left text-[13px]">Message protection</h2>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-mono transition-colors ${
                days === d ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="rounded-lg bg-[var(--color-success)]/8 border border-[var(--color-success)]/15 p-3 text-center">
          <div className="text-[22px] font-bold font-mono text-[var(--color-success)]">{suppressed}</div>
          <div className="text-[10px] font-sans text-muted-foreground mt-0.5">Messages held back</div>
        </div>
        <div className="rounded-lg bg-muted/50 border border-border p-3 text-center">
          <div className="text-[22px] font-bold font-mono text-foreground">{sent}</div>
          <div className="text-[10px] font-sans text-muted-foreground mt-0.5">Messages sent</div>
        </div>
        <div className="rounded-lg bg-muted/50 border border-border p-3 text-center">
          <div className="text-[22px] font-bold font-mono text-foreground">{pct}%</div>
          <div className="text-[10px] font-sans text-muted-foreground mt-0.5">Protection rate</div>
        </div>
      </div>

      {suppressed > 0 && (
        <p className="text-[11px] text-[var(--color-success)] mb-3">
          allo held back {suppressed} messages that would have worn out your customers
        </p>
      )}

      {data?.byReason && data.byReason.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-sans text-muted-foreground uppercase tracking-wider mb-2">Why messages were held back</div>
          {data.byReason.map((r) => (
            <div key={r.reason} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
              <span className="text-[11px] font-sans text-foreground">{r.reason}</span>
              <span className="text-[11px] font-mono text-muted-foreground">{r.count}</span>
            </div>
          ))}
        </div>
      )}

      {suppressed === 0 && sent === 0 && (
        <p className="text-[11px] text-muted-foreground font-sans">
          No messages yet. Once your campaigns start going out, you&apos;ll see how allo protects your customers here.
        </p>
      )}
    </motion.div>
  );
}

export default function SettingsPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: stores, isLoading } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";

  const { data: brandStatus } = (trpc.ai.brandProfileStatus as any).useQuery(
    { storeId },
    { enabled: !!storeId }
  ) as { data: { exists: boolean; creativeIntensity?: string } | undefined };

  const updateIntensityMut = (trpc.ai.updateCreativeIntensity as any).useMutation({
    onSuccess: () => {
      toast("Creative intensity updated.", "success");
      (utils.ai as any).brandProfileStatus.invalidate({ storeId });
    },
    onError: (err: { message?: string }) => toast(err.message || "Couldn't save that. Please try again.", "error"),
  }) as { mutate: (input: { storeId: string; creativeIntensity: string }) => void; isPending: boolean };

  // AI model settings
  const { data: models } = trpc.ai.models.useQuery();
  const { data: aiSettings } = (trpc.ai.getSettings as any).useQuery() as {
    data: { defaultModel: string | null } | undefined;
  };
  const setDefaultModel = (trpc.ai.setDefaultModel as any).useMutation({
    onSuccess: () => {
      toast("Default model updated.", "success");
      (utils.ai as any).getSettings.invalidate();
    },
    onError: (err: { message?: string }) => toast(err.message || "Couldn't save that. Please try again.", "error"),
  }) as { mutate: (input: { model: string | null }) => void; isPending: boolean };

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="section-header accent-bar-left text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">
          Settings
        </h1>
        <p className="text-[13px] text-muted-foreground font-sans mt-1">
          Tune how allo works for you and your store
        </p>
      </motion.div>

      {/* Profile */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-4 h-4 text-muted-foreground" />
          <h2 className="section-header accent-bar-left text-[13px]">Profile</h2>
        </div>
        <div className="flex items-center gap-4">
          {user?.imageUrl ? (
            <img src={user.imageUrl} alt="" className="w-14 h-14 rounded-full" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-[18px] tracking-[-0.5px] font-bold text-secondary-foreground font-sans">
              {(user?.firstName?.[0] || user?.emailAddresses[0]?.emailAddress?.[0] || "U").toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-[13px] font-bold text-foreground">
              {user?.fullName || "User"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {user?.emailAddresses[0]?.emailAddress || ""}
            </p>
            <p className="text-[11px] text-muted-foreground/50 mt-0.5">
              Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "·"}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Appearance — theme lives in Settings, persisted */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <AppearanceSetting />
      </motion.div>

      {/* Connected Stores */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Store className="w-4 h-4 text-muted-foreground" />
          <h2 className="section-header accent-bar-left text-[13px]">Connected stores</h2>
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 glass-skeleton rounded" />
            ))}
          </div>
        ) : stores && stores.length > 0 ? (
          <div className="space-y-3">
            {stores.map((store: { id: string; shopDomain: string; platform: string; isActive: boolean; _count: { products: number; customers: number } }) => (
              <div
                key={store.id}
                className="flex items-center justify-between p-4 bg-card/40 border border-border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#96BF48] flex items-center justify-center">
                    <Store className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-foreground">
                      {store.shopDomain}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {store.platform} · {store._count.products} products · {store._count.customers} customers
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-sans" style={{ color: "var(--color-success)", backgroundColor: "color-mix(in srgb, var(--color-success) 12%, transparent)" }}>
                  Active
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            No store connected yet. Head to Integrations and allo will start learning yours.
          </p>
        )}
      </motion.div>

      {/* Messaging Providers */}
      {storeId && <MessagingConfigSection storeId={storeId} />}

      {/* Knowledge Base */}
      {storeId && <KnowledgeBaseSection storeId={storeId} />}

      {/* AI Preferences */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <h2 className="section-header accent-bar-left text-[13px]">AI preferences</h2>
        </div>
        {brandStatus?.exists ? (
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] text-muted-foreground font-sans mb-3">Creative intensity</label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { value: "text_heavy", label: "Text heavy", desc: "Words first, visuals kept light" },
                  { value: "balanced", label: "Balanced", desc: "An even mix of words and visuals" },
                  { value: "visual_heavy", label: "Visual heavy", desc: "Visuals first, for maximum impact" },
                ] as const).map((opt) => {
                  const current = brandStatus?.creativeIntensity ?? "balanced";
                  return (
                    <button
                      key={opt.value}
                      onClick={() => storeId && updateIntensityMut.mutate({ storeId, creativeIntensity: opt.value })}
                      disabled={updateIntensityMut.isPending}
                      className={`text-left p-4 rounded-xl transition-all ${
                        current === opt.value
                          ? "border border-[var(--terracotta)] shadow-[0_0_0_1px_var(--terracotta)] bg-muted"
                          : "border border-border bg-muted hover:border-border"
                      }`}
                    >
                      <p className="text-[11px] font-bold text-foreground">{opt.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <Sparkles className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-[11px] text-muted-foreground">
              Let allo study your brand first, then these preferences open up.
            </p>
          </div>
        )}
      </motion.div>

      {/* Default AI Model */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Cpu className="w-4 h-4 text-muted-foreground" />
          <h2 className="section-header accent-bar-left text-[13px]">Default AI model</h2>
        </div>
        <p className="text-[11px] text-muted-foreground mb-4">
          Pick the model allo reaches for when it writes and creates for you
        </p>
        {models && models.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {models.map((model) => {
              const isSelected = aiSettings?.defaultModel === model.id;
              const tier = TIER_COLORS[(model as any).tier as string] ?? TIER_COLORS["standard"]!;
              return (
                <button
                  key={model.id}
                  onClick={() => setDefaultModel.mutate({ model: isSelected ? null : model.id })}
                  disabled={setDefaultModel.isPending || !model.available}
                  className={`relative text-left p-4 rounded-xl transition-all ${
                    isSelected
                      ? "glass-card-static shadow-[0_0_0_2px_var(--terracotta)]"
                      : model.available
                        ? "glass-card-static border-border hover:border-border"
                        : "glass-card-static opacity-50 cursor-not-allowed"
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--olive)" }}>
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[11px] font-bold text-foreground">{model.label}</p>
                    <span className="text-[9px] font-sans text-muted-foreground">{model.provider}</span>
                  </div>
                  <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-sans font-bold mb-2" style={{ color: tier.color, backgroundColor: `color-mix(in srgb, ${tier.color} 12%, transparent)` }}>
                    {tier.label}
                  </span>
                  <p className="text-[10px] text-muted-foreground mb-3">{model.description}</p>
                  <div className="text-[10px] font-mono text-muted-foreground space-y-0.5">
                    <p>Input: ${(model as any).inputCostPerMillion}/M tokens</p>
                    <p>Output: ${(model as any).outputCostPerMillion}/M tokens</p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 glass-skeleton rounded-xl" />
            ))}
          </div>
        )}
        {aiSettings?.defaultModel === null && models && (
          <p className="text-[10px] text-muted-foreground/50 mt-3">
            No default chosen. allo will use Claude Sonnet 4.6
          </p>
        )}
      </motion.div>

      {/* Token Usage */}
      <TokenUsageSection />

      {/* Message Protection — fatigue suppression stats */}
      <SuppressionStatsSection />

      {/* Notification Preferences */}
      <NotificationPreferencesSection />

      {/* Billing — Coming Soon */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6 opacity-80">
        <div className="flex items-center gap-3 mb-4">
          <CreditCard className="w-4 h-4 text-muted-foreground" />
          <h2 className="section-header accent-bar-left text-[13px]">Billing</h2>
        </div>
        <div className="py-6">
          <p className="text-[12px] text-muted-foreground font-sans leading-relaxed">
            Subscriptions and payment methods are on the way in our next update.
          </p>
          <p className="text-[11px] mt-3" style={{ color: "var(--terracotta)" }}>
            We&apos;ll let you know the moment it&apos;s ready
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
