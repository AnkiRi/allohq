"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, Play, Pause, Zap, Loader2, Mail, Palette, Phone, MessageSquare, Radio, FlaskConical } from "lucide-react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { SmartEmptyState } from "@/components/ui/SmartEmptyState";
import { useToast } from "@/components/ui/Toast";
import { ModelSelector, type AIModelId } from "@/components/ai/ModelSelector";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const STATUS_BADGES: Record<string, { className: string; label: string }> = {
  recommended: { className: "bg-white/20 text-muted-foreground border border-white/15", label: "Recommended" },
  generating: { className: "bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/20", label: "Generating..." },
  draft: { className: "bg-white/15 text-muted-foreground border border-white/10", label: "Draft" },
  ready: { className: "bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/20", label: "Ready" },
  active: { className: "bg-[var(--color-success)] text-white", label: "Active" },
  paused: { className: "bg-white/15 text-muted-foreground border border-white/10", label: "Paused" },
};

function getCardClasses(status: string): string {
  switch (status) {
    case "recommended":
      return "glass-card-static rounded-xl border-dashed border-white/40 p-6 hover:border-white/60 transition-all";
    case "generating":
      return "glass-card-static rounded-xl border-l-4 border-l-[var(--color-warning)] animate-pulse p-6 transition-all";
    case "ready":
      return "glass-card rounded-xl border-l-4 border-l-[var(--color-warning)] p-6 hover:shadow-lg transition-all";
    case "active":
      return "glass-card rounded-xl border-l-4 border-l-[var(--color-success)] p-6 hover:shadow-lg transition-all";
    case "paused":
      return "glass-card-static rounded-xl opacity-60 p-6 hover:opacity-80 transition-all";
    default:
      return "glass-card rounded-xl p-6 hover:shadow-lg transition-all";
  }
}

export default function AutomationsPage() {
  const { toast } = useToast();
  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";

  const [selectedModel, setSelectedModel] = useState<AIModelId>("claude-sonnet-4-6");
  const [polling, setPolling] = useState(false);

  const { data: brandStatus } = (trpc.ai.brandProfileStatus as any).useQuery(
    { storeId },
    { enabled: !!storeId }
  ) as { data: { exists: boolean; analyzedAt?: string; creativeIntensity?: string } | undefined };
  const hasBrandProfile = brandStatus?.exists ?? false;

  type Automation = {
    id: string; name: string; description: string | null; status: string;
    category: string; triggerType: string;
    templateIds: string[]; whatsappTemplateIds: string[];
    smsTemplateIds: string[]; rcsTemplateIds: string[];
    storeId: string;
  };
  const { data: automations, isLoading } = (trpc.automations.list as any).useQuery(
    storeId ? { storeId } : undefined,
    { enabled: !!storeId, refetchInterval: polling ? 3000 : false }
  ) as { data: Automation[] | undefined; isLoading: boolean };

  useEffect(() => {
    const hasGenerating = automations?.some((a) => a.status === "generating") ?? false;
    setPolling(hasGenerating);
    if (!hasGenerating && polling) {
      toast("Content generated!", "success");
    }
  }, [automations]);

  const utils = trpc.useUtils();

  type MutOpts<D> = { onSuccess: (data: D) => void; onError: (err: { message?: string }) => void };
  type Mut<I, D = void> = { mutate: (input: I) => void; mutateAsync: (input: I) => Promise<D>; isPending: boolean };

  const generateMut = (trpc.automations.generate as any).useMutation({
    onSuccess: () => { utils.automations.list.invalidate(); toast("Content generation started \u2014 this may take a minute", "info"); },
    onError: (err: { message?: string }) => toast(err.message || "Failed to generate", "error"),
  } satisfies MutOpts<unknown>) as Mut<{ id: string; model?: string }>;

  const generateAllMut = (trpc.automations.generateAll as any).useMutation({
    onSuccess: (data: { queued: number }) => { utils.automations.list.invalidate(); toast(`Generating content for ${data.queued} automations...`, "info"); },
    onError: (err: { message?: string }) => toast(err.message || "Failed to generate", "error"),
  } satisfies MutOpts<{ queued: number }>) as Mut<{ storeId: string; model?: string }, { queued: number }>;

  const activateMut = (trpc.automations.activate as any).useMutation({
    onSuccess: () => { utils.automations.list.invalidate(); toast("Automation activated!", "success"); },
    onError: (err: { message?: string }) => toast(err.message || "Failed to activate", "error"),
  } satisfies MutOpts<unknown>) as Mut<{ id: string }>;

  const pauseMut = (trpc.automations.pause as any).useMutation({
    onSuccess: () => { utils.automations.list.invalidate(); toast("Automation paused", "info"); },
    onError: (err: { message?: string }) => toast(err.message || "Failed to pause", "error"),
  } satisfies MutOpts<unknown>) as Mut<{ id: string }>;

  const resumeMut = (trpc.automations.resume as any).useMutation({
    onSuccess: () => { utils.automations.list.invalidate(); toast("Automation resumed!", "success"); },
    onError: (err: { message?: string }) => toast(err.message || "Failed to resume", "error"),
  } satisfies MutOpts<unknown>) as Mut<{ id: string }>;

  const isGenerating = automations?.some((a) => a.status === "generating");

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="section-header accent-bar-left text-[22px] tracking-[-0.5px] font-bold text-foreground font-mono flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> AUTOMATIONS
          </h1>
          <p className="text-[13px] text-muted-foreground font-sans mt-1">
            {automations ? `${automations.filter((a) => a.status === "active").length} active, ${automations.filter((a) => a.status === "ready").length} ready for activation, ${automations.filter((a) => a.status === "generating").length} generating content` : "AI-powered multi-channel automations"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {storeId && automations && automations.some((a) => a.status === "recommended") && (
            <button
              onClick={() => storeId && generateAllMut.mutate({ storeId, model: selectedModel })}
              disabled={generateAllMut.isPending || !hasBrandProfile}
              title={!hasBrandProfile ? "Run brand analysis first" : ""}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-xs font-mono font-bold hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {generateAllMut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              {generateAllMut.isPending ? "Generating..." : "Generate All"}
            </button>
          )}
          <ModelSelector value={selectedModel} onChange={setSelectedModel} compact />
        </div>
      </motion.div>

      {/* Brand analysis gate banner */}
      {storeId && !hasBrandProfile && (
        <motion.div
          variants={itemVariants}
          className="glass-card-static border-l-4 border-l-terracotta flex items-center gap-3 px-4 py-3"
        >
          <Palette className="w-4 h-4 text-terracotta flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[13px] font-bold text-foreground font-mono">Set up your brand voice first</p>
            <p className="text-[11px] text-muted-foreground font-sans mt-0.5">
              Brand analysis is required before generating automations. This helps AI create on-brand content.
            </p>
          </div>
          <Link
            href="/intelligence/brand"
            className="flex items-center gap-2 px-4 py-2 bg-terracotta text-white rounded-lg text-xs font-mono hover:bg-terracotta/90 transition-all whitespace-nowrap"
          >
            <Palette className="w-3.5 h-3.5" />
            Set Up Brand
          </Link>
        </motion.div>
      )}

      {/* Generating banner */}
      {isGenerating && (
        <motion.div
          variants={itemVariants}
          className="glass-card-static border-l-4 border-l-warm-gold flex items-center gap-3 px-4 py-3"
        >
          <Loader2 className="w-4 h-4 text-warm-gold animate-spin flex-shrink-0" />
          <div>
            <p className="text-[13px] font-bold text-foreground font-mono">Generating content...</p>
            <p className="text-[11px] text-muted-foreground font-sans mt-0.5">
              AI is creating email, SMS, WhatsApp, and RCS content. This may take 30-60 seconds per automation.
            </p>
            <p className="text-[10px] text-warm-gold font-mono mt-1">
              Progress updates will appear automatically as each automation completes.
            </p>
          </div>
        </motion.div>
      )}

      {/* Automations grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 glass-skeleton rounded-xl" />
          ))}
        </div>
      ) : automations && automations.length > 0 ? (
        <motion.div
          className="grid grid-cols-2 gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {automations.map((automation) => {
            const badge = STATUS_BADGES[automation.status] ?? STATUS_BADGES["recommended"]!;
            const emailCount = automation.templateIds.length;
            const smsCount = automation.smsTemplateIds?.length ?? 0;
            const whatsappCount = automation.whatsappTemplateIds?.length ?? 0;
            const rcsCount = automation.rcsTemplateIds?.length ?? 0;

            return (
              <motion.div
                key={automation.id}
                variants={itemVariants}
                className={getCardClasses(automation.status)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[13px] font-bold text-foreground font-mono">{automation.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/50">
                        {automation.category.replace(/_/g, " ").toUpperCase()}
                      </span>
                    </div>
                  </div>
                  {/* Channel counts + A/B link */}
                  <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground font-mono flex-shrink-0 ml-3">
                    <span className="flex items-center gap-1" title="Email templates">
                      <Mail className="w-3 h-3" />
                      {emailCount}
                    </span>
                    {smsCount > 0 && (
                      <span className="flex items-center gap-1" title="SMS templates">
                        <MessageSquare className="w-3 h-3" />
                        {smsCount}
                      </span>
                    )}
                    {whatsappCount > 0 && (
                      <span className="flex items-center gap-1" title="WhatsApp templates">
                        <Phone className="w-3 h-3" />
                        {whatsappCount}
                      </span>
                    )}
                    {rcsCount > 0 && (
                      <span className="flex items-center gap-1" title="RCS templates">
                        <Radio className="w-3 h-3" />
                        {rcsCount}
                      </span>
                    )}
                    <Link
                      href={`/automations/${automation.id}/ab-test`}
                      title="A/B Tests"
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-pink-50 border border-pink-200 text-pink-700 hover:bg-pink-100 transition-colors text-[10px] font-mono font-bold"
                    >
                      <FlaskConical className="w-3 h-3" />
                      A/B
                    </Link>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground font-sans mb-4 line-clamp-2">{automation.description}</p>

                <div className="flex gap-2">
                  {automation.status === "recommended" && (
                    <button
                      onClick={() => generateMut.mutate({ id: automation.id, model: selectedModel })}
                      disabled={generateMut.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 bg-terracotta text-white rounded-lg text-xs font-mono font-bold hover:bg-terracotta/90 disabled:opacity-50 transition-all"
                    >
                      {generateMut.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      {generateMut.isPending ? "Starting..." : "Generate"}
                    </button>
                  )}
                  {automation.status === "generating" && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-warm-gold/10 text-warm-gold border border-warm-gold/20 rounded-lg text-xs font-mono">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Generating content...
                    </div>
                  )}
                  {automation.status === "ready" && (
                    <>
                      <Link
                        href={`/automations/${automation.id}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-white/30 rounded-lg text-xs font-mono text-foreground hover:bg-white/10 transition-all"
                      >
                        View Details
                      </Link>
                      <button
                        onClick={() => activateMut.mutate({ id: automation.id })}
                        disabled={activateMut.isPending}
                        className="flex items-center gap-1.5 px-4 py-2 bg-olive text-white rounded-lg text-xs font-mono font-bold hover:bg-olive/90 disabled:opacity-50 transition-all"
                      >
                        <Play className="w-3 h-3" />
                        Go Live
                      </button>
                    </>
                  )}
                  {automation.status === "active" && (
                    <>
                      <Link
                        href={`/automations/${automation.id}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-white/30 rounded-lg text-xs font-mono text-foreground hover:bg-white/10 transition-all"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => pauseMut.mutate({ id: automation.id })}
                        disabled={pauseMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-white/30 rounded-lg text-xs font-mono text-foreground hover:bg-white/10 disabled:opacity-50 transition-all"
                      >
                        <Pause className="w-3 h-3" />
                        Pause
                      </button>
                    </>
                  )}
                  {automation.status === "paused" && (
                    <>
                      <Link
                        href={`/automations/${automation.id}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-white/30 rounded-lg text-xs font-mono text-foreground hover:bg-white/10 transition-all"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => resumeMut.mutate({ id: automation.id })}
                        disabled={resumeMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-olive/80 text-white rounded-lg text-xs font-mono hover:bg-olive/90 disabled:opacity-50 transition-all"
                      >
                        <Play className="w-3 h-3" />
                        Resume
                      </button>
                    </>
                  )}
                  {automation.status === "draft" && (
                    <Link
                      href={`/automations/${automation.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-white/30 rounded-lg text-xs font-mono text-foreground hover:bg-white/10 transition-all"
                    >
                      Edit
                    </Link>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      ) : (
        <SmartEmptyState
          icon={Sparkles}
          title="No automations yet"
          description="Allo has recommended automations for your store based on customer analysis."
          actions={[{ label: "Review & Activate", href: "/automations", primary: true }]}
        />
      )}
    </motion.div>
  );
}
