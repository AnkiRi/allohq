"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, RefreshCw, Palette, Type, MessageSquare, Quote, AlertTriangle, Sliders } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { ModelSelector, type AIModelId } from "@/components/ai/ModelSelector";

export default function BrandProfilePage() {
  const { toast } = useToast();
  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";

  const [selectedModel, setSelectedModel] = useState<AIModelId>("claude-sonnet-4-5-20250929");
  const [analyzing, setAnalyzing] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const analyzeStartedAt = useRef<number>(0);

  const { data: profile, isLoading } = trpc.ai.brandProfile.useQuery(
    { storeId },
    {
      enabled: !!storeId,
      refetchInterval: analyzing ? 3000 : false,
    }
  ) as {
    data: { brandName: string; brandDescription: string | null; toneAttributes: unknown; vocabulary: unknown; visualStyle: unknown; sampleCopy: unknown; analyzedAt: string } | null | undefined;
    isLoading: boolean;
  };

  // Poll job status to detect failures
  const { data: jobStatus } = trpc.ai.brandAnalysisStatus.useQuery(
    { jobId: jobId! },
    {
      enabled: !!jobId && analyzing,
      refetchInterval: 3000,
    }
  );

  const prevAnalyzedAt = useRef<string | null>(null);

  // Detect completion or failure
  useEffect(() => {
    if (!analyzing) return;

    // Check if job failed
    if (jobStatus?.status === "failed") {
      setAnalyzing(false);
      setJobId(null);
      const reason = jobStatus.failedReason ?? "Unknown error";
      const friendlyMsg = reason.includes("429")
        ? "AI API quota exceeded. Please check your billing settings."
        : reason.includes("API key") || reason.includes("apiKey")
          ? "AI API key is missing or invalid. Check your ANTHROPIC_API_KEY or OPENAI_API_KEY."
          : reason.includes("All AI models failed")
            ? "All AI models failed. Please check your API keys in environment variables."
            : `Analysis failed: ${reason}`;
      setError(friendlyMsg);
      toast(friendlyMsg, "error");
      return;
    }

    // Check if profile updated (success)
    if (profile?.analyzedAt && profile.analyzedAt !== prevAnalyzedAt.current) {
      setAnalyzing(false);
      setJobId(null);
      setError(null);
      prevAnalyzedAt.current = profile.analyzedAt;
      toast("Brand analysis complete!", "success");
      return;
    }

    // Timeout after 90 seconds
    if (Date.now() - analyzeStartedAt.current > 90000) {
      setAnalyzing(false);
      setJobId(null);
      setError("Analysis is taking too long. It may still complete in the background — try refreshing in a minute.");
      toast("Analysis timed out", "error");
    }
  }, [profile?.analyzedAt, jobStatus, analyzing, toast]);

  const updateIntensityMut = (trpc.ai.updateCreativeIntensity as any).useMutation({
    onSuccess: () => toast("Creative intensity updated!", "success"),
    onError: (err: { message?: string }) => toast(err.message || "Failed to update", "error"),
  }) as { mutate: (input: { storeId: string; creativeIntensity: string }) => void; isPending: boolean };

  const analyzeMut = trpc.ai.analyzeBrand.useMutation({
    onSuccess: (data) => {
      setAnalyzing(true);
      setError(null);
      setJobId(data.jobId ?? null);
      analyzeStartedAt.current = Date.now();
      prevAnalyzedAt.current = profile?.analyzedAt ?? null;
      toast("Brand analysis started — this takes ~15 seconds", "info");
    },
    onError: (err) => {
      setError(err.message || "Failed to start analysis");
      toast(err.message || "Failed to start analysis", "error");
    },
  });

  function handleAnalyze() {
    if (!storeId || analyzing || analyzeMut.isPending) return;
    setError(null);
    analyzeMut.mutate({ storeId, model: selectedModel });
  }

  const tone = profile?.toneAttributes as Record<string, string> | undefined;
  const vocabulary = profile?.vocabulary as Record<string, string[]> | undefined;
  const visual = profile?.visualStyle as Record<string, string | string[]> | undefined;
  const sampleCopy = profile?.sampleCopy as string[] | undefined;

  const isAnalyzing = analyzeMut.isPending || analyzing;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/intelligence" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">BRAND_VOICE</h1>
            <p className="text-sm text-gray-400 font-mono mt-1">
              AI-extracted brand personality from your store data
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
        <ModelSelector value={selectedModel} onChange={setSelectedModel} compact />
        <button
          onClick={handleAnalyze}
          disabled={!storeId || isAnalyzing}
          title={!storeId ? "Connect a store first" : ""}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin" : ""}`} />
          {!storeId ? "Connect Store First" : isAnalyzing ? "Analyzing..." : "Re-analyze"}
        </button>
        </div>
      </div>

      {/* Analyzing banner */}
      {analyzing && (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
          <RefreshCw className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-blue-900 font-mono">Analyzing brand voice...</p>
            <p className="text-xs text-blue-600 font-mono mt-0.5">
              AI is reading your product catalog and extracting brand personality. This typically takes 10-20 seconds.
            </p>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && !analyzing && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-900 font-mono">Analysis failed</p>
            <p className="text-xs text-red-600 font-mono mt-0.5">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-xs text-red-400 hover:text-red-600 font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : profile ? (
        <div className="space-y-6">
          {/* Brand overview */}
          <div className="border border-gray-200 rounded-xl p-6 bg-white">
            <h2 className="text-lg font-bold text-gray-900 font-mono mb-1">{profile.brandName}</h2>
            <p className="text-sm text-gray-500 font-mono">{profile.brandDescription}</p>
            <p className="text-[10px] text-gray-300 font-mono mt-3">
              Last analyzed: {new Date(profile.analyzedAt).toLocaleString()}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Tone attributes */}
            <div className="border border-gray-200 rounded-xl p-6 bg-white">
              <div className="flex items-center gap-3 mb-4">
                <MessageSquare className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-bold text-gray-900 font-mono">TONE</h2>
              </div>
              {tone && (
                <div className="space-y-3">
                  {Object.entries(tone).map(([key, value]) => (
                    <div key={key}>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span className="text-gray-400 uppercase">{key}</span>
                        <span className="text-gray-900 font-bold">{value}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gray-900 rounded-full transition-all"
                          style={{
                            width: `${
                              value === "formal" || value === "none" || value === "calm" || value === "professional"
                                ? 25
                                : value === "semi-formal" || value === "light" || value === "moderate" || value === "friendly"
                                  ? 50
                                  : value === "casual" || value === "moderate" || value === "high" || value === "warm"
                                    ? 75
                                    : 100
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Visual style */}
            <div className="border border-gray-200 rounded-xl p-6 bg-white">
              <div className="flex items-center gap-3 mb-4">
                <Palette className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-bold text-gray-900 font-mono">VISUAL_STYLE</h2>
              </div>
              {visual && (
                <div className="space-y-4">
                  <div>
                    <span className="text-xs text-gray-400 font-mono">AESTHETIC</span>
                    <p className="text-sm font-bold text-gray-900 font-mono mt-0.5">
                      {typeof visual["aesthetic"] === "string" ? visual["aesthetic"] : ""}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 font-mono">FONT STYLE</span>
                    <p className="text-sm font-bold text-gray-900 font-mono mt-0.5">
                      {typeof visual["fontStyle"] === "string" ? visual["fontStyle"] : ""}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 font-mono mb-2 block">COLORS</span>
                    <div className="flex gap-2">
                      {(Array.isArray(visual["suggestedColors"]) ? visual["suggestedColors"] : []).map((color, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <div
                            className="w-6 h-6 rounded-full border border-gray-200"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-[10px] text-gray-400 font-mono">{color}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Creative Intensity */}
          <div className="border border-gray-200 rounded-xl p-6 bg-white">
            <div className="flex items-center gap-3 mb-4">
              <Sliders className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-bold text-gray-900 font-mono">CREATIVE_INTENSITY</h2>
            </div>
            <p className="text-xs text-gray-400 font-mono mb-4">
              Controls the visual richness of AI-generated emails
            </p>
            <div className="grid grid-cols-3 gap-3">
              {([
                { value: "text_heavy", label: "Text Heavy", desc: "Copy-focused, minimal visuals" },
                { value: "balanced", label: "Balanced", desc: "Mix of visuals and copy" },
                { value: "visual_heavy", label: "Visual Heavy", desc: "Maximum visual impact" },
              ] as const).map((opt) => {
                const currentIntensity = (profile as any)?.creativeIntensity ?? "balanced";
                return (
                  <button
                    key={opt.value}
                    onClick={() => storeId && updateIntensityMut.mutate({ storeId, creativeIntensity: opt.value })}
                    disabled={updateIntensityMut.isPending}
                    className={`text-left p-4 border rounded-xl transition-all ${
                      currentIntensity === opt.value
                        ? "border-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,1)] bg-gray-50"
                        : "border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    <p className="text-xs font-bold text-gray-900 font-mono">{opt.label}</p>
                    <p className="text-[10px] text-gray-400 font-mono mt-1">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vocabulary */}
          <div className="border border-gray-200 rounded-xl p-6 bg-white">
            <div className="flex items-center gap-3 mb-4">
              <Type className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-bold text-gray-900 font-mono">VOCABULARY</h2>
            </div>
            {vocabulary && (
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <span className="text-xs text-gray-400 font-mono block mb-2">PREFERRED WORDS</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(vocabulary["preferredWords"] ?? []).map((word, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-mono rounded">
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-gray-400 font-mono block mb-2">CTA PATTERNS</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(vocabulary["ctaPatterns"] ?? []).map((cta, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-900 text-white text-xs font-mono rounded">
                        {cta}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-gray-400 font-mono block mb-2">BRAND TERMS</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(vocabulary["brandTerms"] ?? []).map((term, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-50 border border-gray-200 text-gray-700 text-xs font-mono rounded">
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sample copy */}
          {sampleCopy && sampleCopy.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-6 bg-white">
              <div className="flex items-center gap-3 mb-4">
                <Quote className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-bold text-gray-900 font-mono">SAMPLE_COPY</h2>
              </div>
              <div className="space-y-3">
                {sampleCopy.map((copy, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-lg border-l-2 border-gray-900">
                    <p className="text-xs text-gray-700 font-mono leading-relaxed">{copy}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-20 border border-gray-200 rounded-xl bg-white">
          <Palette className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400 font-mono">No brand profile yet</p>
          <p className="text-xs text-gray-300 font-mono mt-1">
            Brand analysis runs automatically after Shopify sync, or click &quot;Re-analyze&quot;
          </p>
        </div>
      )}
    </div>
  );
}
