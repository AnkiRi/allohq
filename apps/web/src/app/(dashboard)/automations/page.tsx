"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, Play, Pause, RefreshCw, Zap, Loader2, Mail, AlertTriangle, Palette, Bot, Phone, MessageSquare, Radio } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { ModelSelector, type AIModelId } from "@/components/ai/ModelSelector";

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  recommended: { bg: "bg-blue-50", text: "text-blue-600", label: "Recommended" },
  generating: { bg: "bg-yellow-50", text: "text-yellow-600", label: "Generating..." },
  draft: { bg: "bg-muted", text: "text-muted-foreground", label: "Draft" },
  ready: { bg: "bg-green-50", text: "text-green-600", label: "Ready" },
  active: { bg: "bg-secondary", text: "text-secondary-foreground", label: "Active" },
  paused: { bg: "bg-muted", text: "text-muted-foreground", label: "Paused" },
};

export default function AutomationsPage() {
  const { toast } = useToast();
  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";

  const [selectedModel, setSelectedModel] = useState<AIModelId>("claude-sonnet-4-5-20250929");
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

  const recommendMut = (trpc.automations.recommend as any).useMutation({
    onSuccess: (data: unknown[]) => { utils.automations.list.invalidate(); toast(`${data.length} automations recommended!`, "success"); },
    onError: (err: { message?: string }) => toast(err.message || "Failed to analyze", "error"),
  } satisfies MutOpts<unknown[]>) as Mut<{ storeId: string }, unknown[]>;

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

  const launchAgentMut = (trpc.automations.launchAgent as any).useMutation({
    onSuccess: () => { toast("AI Agent launched! Check the dashboard for progress.", "success"); },
    onError: (err: { message?: string }) => toast(err.message || "Failed to launch agent", "error"),
  } satisfies MutOpts<unknown>) as Mut<{ storeId: string; model?: string }>;

  const [recommending, setRecommending] = useState(false);

  async function handleRecommend() {
    if (!storeId) return;
    setRecommending(true);
    try {
      await recommendMut.mutateAsync({ storeId });
    } finally {
      setRecommending(false);
    }
  }

  const isGenerating = automations?.some((a) => a.status === "generating");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] tracking-[-0.5px] font-bold text-foreground font-mono flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> AUTOMATIONS
          </h1>
          <p className="text-[13px] text-muted-foreground font-mono mt-1">
            AI-powered multi-channel automations — one click to activate your entire retention strategy
          </p>
        </div>
        <div className="flex gap-2">
          {!storeId ? (
            <span className="flex items-center gap-2 px-4 py-2 bg-muted text-muted-foreground rounded-lg text-xs font-mono cursor-not-allowed">
              <AlertTriangle className="w-3.5 h-3.5" />
              Connect Store First
            </span>
          ) : (
            <>
              <ModelSelector value={selectedModel} onChange={setSelectedModel} compact />
              <button
                onClick={() => storeId && launchAgentMut.mutate({ storeId, model: selectedModel })}
                disabled={launchAgentMut.isPending || !hasBrandProfile}
                title={!hasBrandProfile ? "Run brand analysis first" : ""}
                className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono hover:bg-secondary/90 disabled:opacity-50 transition-all"
              >
                {launchAgentMut.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Bot className="w-3.5 h-3.5" />
                )}
                {launchAgentMut.isPending ? "Launching..." : "Launch AI Agent"}
              </button>
              <button
                onClick={handleRecommend}
                disabled={recommending || !hasBrandProfile}
                title={!hasBrandProfile ? "Run brand analysis first" : ""}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-xs font-mono text-foreground hover:border-primary/50 disabled:opacity-50 transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${recommending ? "animate-spin" : ""}`} />
                {recommending ? "Analyzing..." : "Analyze & Recommend"}
              </button>
              {automations && automations.some((a) => a.status === "recommended") && (
                <button
                  onClick={() => storeId && generateAllMut.mutate({ storeId, model: selectedModel })}
                  disabled={generateAllMut.isPending || !hasBrandProfile}
                  title={!hasBrandProfile ? "Run brand analysis first" : ""}
                  className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono hover:bg-secondary/90 disabled:opacity-50 transition-all"
                >
                  {generateAllMut.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  {generateAllMut.isPending ? "Queuing..." : "Activate All"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Brand analysis gate banner */}
      {storeId && !hasBrandProfile && (
        <div className="flex items-center gap-3 px-4 py-3 bg-purple-50 border border-purple-200 rounded-xl">
          <Palette className="w-4 h-4 text-purple-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[13px] font-bold text-purple-900 font-mono">Set up your brand voice first</p>
            <p className="text-[11px] text-purple-600 font-mono mt-0.5">
              Brand analysis is required before generating automations. This helps AI create on-brand content.
            </p>
          </div>
          <Link
            href="/intelligence/brand"
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-xs font-mono hover:bg-purple-700 transition-all whitespace-nowrap"
          >
            <Palette className="w-3.5 h-3.5" />
            Set Up Brand
          </Link>
        </div>
      )}

      {/* Generating banner */}
      {isGenerating && (
        <div className="flex items-center gap-3 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-xl">
          <Loader2 className="w-4 h-4 text-yellow-600 animate-spin flex-shrink-0" />
          <div>
            <p className="text-[13px] font-bold text-yellow-900 font-mono">Generating content...</p>
            <p className="text-[11px] text-yellow-600 font-mono mt-0.5">
              AI is creating email, SMS, WhatsApp, and RCS content. This may take 30-60 seconds per automation.
            </p>
          </div>
        </div>
      )}

      {/* Automations grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : automations && automations.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {automations.map((automation) => {
            const badge = STATUS_BADGES[automation.status] ?? STATUS_BADGES["recommended"]!;
            return (
              <div
                key={automation.id}
                className="border border-border rounded-xl bg-card p-6 hover:border-foreground hover:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-[13px] font-bold text-foreground font-mono">{automation.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/50">
                        {automation.category.replace(/_/g, " ").toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {automation.templateIds.length}
                    </span>
                    {automation.smsTemplateIds?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {automation.smsTemplateIds.length}
                      </span>
                    )}
                    {automation.whatsappTemplateIds?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {automation.whatsappTemplateIds.length}
                      </span>
                    )}
                    {automation.rcsTemplateIds?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Radio className="w-3 h-3" />
                        {automation.rcsTemplateIds.length}
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground font-mono mb-4 line-clamp-2">{automation.description}</p>

                <div className="flex gap-2">
                  {automation.status === "recommended" && (
                    <button
                      onClick={() => generateMut.mutate({ id: automation.id, model: selectedModel })}
                      disabled={generateMut.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono hover:bg-secondary/90 disabled:opacity-50 transition-all"
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
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 text-yellow-600 rounded-lg text-xs font-mono">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Generating content...
                    </div>
                  )}
                  {automation.status === "ready" && (
                    <>
                      <Link
                        href={`/automations/${automation.id}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-mono text-foreground hover:border-primary/50 transition-all"
                      >
                        View Details
                      </Link>
                      <button
                        onClick={() => activateMut.mutate({ id: automation.id })}
                        disabled={activateMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono hover:bg-secondary/90 disabled:opacity-50 transition-all"
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
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-mono text-foreground hover:border-primary/50 transition-all"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => pauseMut.mutate({ id: automation.id })}
                        disabled={pauseMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-mono text-foreground hover:border-primary/50 disabled:opacity-50 transition-all"
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
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-mono text-foreground hover:border-primary/50 transition-all"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => resumeMut.mutate({ id: automation.id })}
                        disabled={resumeMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono hover:bg-secondary/90 disabled:opacity-50 transition-all"
                      >
                        <Play className="w-3 h-3" />
                        Resume
                      </button>
                    </>
                  )}
                  {automation.status === "draft" && (
                    <Link
                      href={`/automations/${automation.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-mono text-foreground hover:border-primary/50 transition-all"
                    >
                      Edit
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 border border-border rounded-xl bg-card">
          <Sparkles className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-[13px] text-muted-foreground font-mono">No automations yet</p>
          <p className="text-[11px] text-muted-foreground/50 font-mono mt-1">
            Click &quot;Analyze &amp; Recommend&quot; to get AI-powered automation suggestions
          </p>
        </div>
      )}
    </div>
  );
}
