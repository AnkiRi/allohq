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
  ready: { bg: "bg-green-50", text: "text-green-600", label: "Ready" },
  active: { bg: "bg-gray-900", text: "text-white", label: "Active" },
  paused: { bg: "bg-gray-100", text: "text-gray-500", label: "Paused" },
};

export default function ProgramsPage() {
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
  type Program = { id: string; name: string; description: string; status: string; templateIds: string[]; whatsappTemplateIds: string[]; smsTemplateIds: string[]; rcsTemplateIds: string[]; programType: string; storeId: string };
  const { data: programs, isLoading } = (trpc.programs.list as any).useQuery(
    storeId ? { storeId } : undefined,
    {
      enabled: !!storeId,
      refetchInterval: polling ? 3000 : false,
    }
  ) as { data: Program[] | undefined; isLoading: boolean };

  // Start/stop polling when programs are generating
  useEffect(() => {
    const hasGenerating = programs?.some((p) => p.status === "generating") ?? false;
    setPolling(hasGenerating);
    if (!hasGenerating && polling) {
      // A program just finished generating — show toast
      toast("Email content generated!", "success");
    }
  }, [programs]);

  const utils = trpc.useUtils();

  // tRPC + Prisma JSON fields cause TS2589 (excessively deep type instantiation).
  // Cast through `any` to break the recursion while keeping runtime safety.
  type MutOpts<D> = { onSuccess: (data: D) => void; onError: (err: { message?: string }) => void };
  type Mut<I, D = void> = { mutate: (input: I) => void; mutateAsync: (input: I) => Promise<D>; isPending: boolean };

  const recommendMut = (trpc.programs.recommend as any).useMutation({
    onSuccess: (data: unknown[]) => { utils.programs.list.invalidate(); toast(`${data.length} programs recommended!`, "success"); },
    onError: (err: { message?: string }) => toast(err.message || "Failed to analyze", "error"),
  } satisfies MutOpts<unknown[]>) as Mut<{ storeId: string }, unknown[]>;

  const generateMut = (trpc.programs.generate as any).useMutation({
    onSuccess: () => { utils.programs.list.invalidate(); toast("Content generation started — this may take a minute", "info"); },
    onError: (err: { message?: string }) => toast(err.message || "Failed to generate", "error"),
  } satisfies MutOpts<unknown>) as Mut<{ id: string; model?: string }>;

  const generateAllMut = (trpc.programs.generateAll as any).useMutation({
    onSuccess: (data: { queued: number }) => { utils.programs.list.invalidate(); toast(`Generating content for ${data.queued} programs...`, "info"); },
    onError: (err: { message?: string }) => toast(err.message || "Failed to generate", "error"),
  } satisfies MutOpts<{ queued: number }>) as Mut<{ storeId: string; model?: string }, { queued: number }>;

  const activateMut = (trpc.programs.activate as any).useMutation({
    onSuccess: () => { utils.programs.list.invalidate(); toast("Program activated!", "success"); },
    onError: (err: { message?: string }) => toast(err.message || "Failed to activate", "error"),
  } satisfies MutOpts<unknown>) as Mut<{ id: string }>;

  const pauseMut = (trpc.programs.pause as any).useMutation({
    onSuccess: () => { utils.programs.list.invalidate(); toast("Program paused", "info"); },
    onError: (err: { message?: string }) => toast(err.message || "Failed to pause", "error"),
  } satisfies MutOpts<unknown>) as Mut<{ id: string }>;

  const resumeMut = (trpc.programs.resume as any).useMutation({
    onSuccess: () => { utils.programs.list.invalidate(); toast("Program resumed!", "success"); },
    onError: (err: { message?: string }) => toast(err.message || "Failed to resume", "error"),
  } satisfies MutOpts<unknown>) as Mut<{ id: string }>;

  const launchAgentMut = (trpc.programs.launchAgent as any).useMutation({
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

  const isGenerating = programs?.some((p) => p.status === "generating");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> PROGRAMS
          </h1>
          <p className="text-sm text-gray-400 font-mono mt-1">
            AI-powered email programs — one click to activate your entire email strategy
          </p>
        </div>
        <div className="flex gap-2">
          {!storeId ? (
            <span className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-xs font-mono cursor-not-allowed">
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
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 disabled:opacity-50 transition-all"
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
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 hover:border-gray-400 disabled:opacity-50 transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${recommending ? "animate-spin" : ""}`} />
                {recommending ? "Analyzing..." : "Analyze & Recommend"}
              </button>
              {programs && programs.some((p) => p.status === "recommended") && (
                <button
                  onClick={() => storeId && generateAllMut.mutate({ storeId, model: selectedModel })}
                  disabled={generateAllMut.isPending || !hasBrandProfile}
                  title={!hasBrandProfile ? "Run brand analysis first" : ""}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 disabled:opacity-50 transition-all"
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
            <p className="text-sm font-bold text-purple-900 font-mono">Set up your brand voice first</p>
            <p className="text-xs text-purple-600 font-mono mt-0.5">
              Brand analysis is required before generating email programs. This helps AI create on-brand content.
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
            <p className="text-sm font-bold text-yellow-900 font-mono">Generating email content...</p>
            <p className="text-xs text-yellow-600 font-mono mt-0.5">
              AI is writing email copy for each program. This may take 30-60 seconds per program.
            </p>
          </div>
        </div>
      )}

      {/* Programs grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : programs && programs.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {programs.map((program) => {
            const badge = STATUS_BADGES[program.status] ?? STATUS_BADGES["recommended"]!;
            return (
              <div
                key={program.id}
                className="border border-gray-200 rounded-xl bg-white p-6 hover:border-gray-900 hover:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 font-mono">{program.name}</h3>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {program.templateIds.length}
                    </span>
                    {program.smsTemplateIds?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {program.smsTemplateIds.length}
                      </span>
                    )}
                    {program.whatsappTemplateIds?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {program.whatsappTemplateIds.length}
                      </span>
                    )}
                    {program.rcsTemplateIds?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Radio className="w-3 h-3" />
                        {program.rcsTemplateIds.length}
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-gray-500 font-mono mb-4 line-clamp-2">{program.description}</p>

                <div className="flex gap-2">
                  {program.status === "recommended" && (
                    <button
                      onClick={() => generateMut.mutate({ id: program.id, model: selectedModel })}
                      disabled={generateMut.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 disabled:opacity-50 transition-all"
                    >
                      {generateMut.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      {generateMut.isPending ? "Starting..." : "Generate"}
                    </button>
                  )}
                  {program.status === "generating" && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 text-yellow-600 rounded-lg text-xs font-mono">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Generating content...
                    </div>
                  )}
                  {program.status === "ready" && (
                    <>
                      <Link
                        href={`/programs/${program.id}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 hover:border-gray-400 transition-all"
                      >
                        View Emails
                      </Link>
                      <button
                        onClick={() => activateMut.mutate({ id: program.id })}
                        disabled={activateMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 disabled:opacity-50 transition-all"
                      >
                        <Play className="w-3 h-3" />
                        Go Live
                      </button>
                    </>
                  )}
                  {program.status === "active" && (
                    <>
                      <Link
                        href={`/programs/${program.id}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 hover:border-gray-400 transition-all"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => pauseMut.mutate({ id: program.id })}
                        disabled={pauseMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 hover:border-gray-400 disabled:opacity-50 transition-all"
                      >
                        <Pause className="w-3 h-3" />
                        Pause
                      </button>
                    </>
                  )}
                  {program.status === "paused" && (
                    <button
                      onClick={() => resumeMut.mutate({ id: program.id })}
                      disabled={resumeMut.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 disabled:opacity-50 transition-all"
                    >
                      <Play className="w-3 h-3" />
                      Resume
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 border border-gray-200 rounded-xl bg-white">
          <Sparkles className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400 font-mono">No programs yet</p>
          <p className="text-xs text-gray-300 font-mono mt-1">
            Click &quot;Analyze &amp; Recommend&quot; to get AI-powered email program suggestions
          </p>
        </div>
      )}
    </div>
  );
}
