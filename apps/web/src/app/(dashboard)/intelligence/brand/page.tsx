"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, RefreshCw, Palette, Type, MessageSquare, Quote, AlertTriangle, Sliders, Image, MapPin, Share2, Store, Save } from "lucide-react";
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

  const utils = trpc.useUtils();
  const updateIntensityMut = (trpc.ai.updateCreativeIntensity as any).useMutation({
    onSuccess: () => {
      toast("Creative intensity updated!", "success");
      (utils.ai as any).brandProfile.invalidate({ storeId });
    },
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

  // Brand settings queries
  const { data: storeMetadata } = trpc.stores.getMetadata.useQuery(
    { storeId },
    { enabled: !!storeId }
  ) as { data: { storeName: string | null; storeEmail: string | null; storePhone: string | null; storeLogoUrl: string | null; storeDescription: string | null; address: any; socialLinks: any; currency: string | null; timezone: string | null; shopDomain: string } | null | undefined };
  const { data: brandSettings } = (trpc.ai as any).getBrandSettings.useQuery(
    { storeId },
    { enabled: !!storeId }
  ) as { data: { logoPosition?: string; headerBgColor?: string; footerText?: string; showSocialLinks?: boolean; showAddress?: boolean } | null | undefined };

  // Local state for editable fields
  const [logoUrl, setLogoUrl] = useState("");
  const [logoPosition, setLogoPosition] = useState<"left" | "center" | "right">("center");
  const [headerBgColor, setHeaderBgColor] = useState("#ffffff");
  const [footerText, setFooterText] = useState("");
  const [showSocialLinks, setShowSocialLinks] = useState(true);
  const [showAddress, setShowAddress] = useState(true);
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});
  const [storeDetails, setStoreDetails] = useState<{ storeName: string; storeEmail: string; storePhone: string; address: any }>({
    storeName: "", storeEmail: "", storePhone: "", address: null,
  });

  // Sync from server data
  useEffect(() => {
    if (storeMetadata) {
      setLogoUrl(storeMetadata.storeLogoUrl ?? "");
      setSocialLinks((storeMetadata.socialLinks as Record<string, string>) ?? {});
      setStoreDetails({
        storeName: storeMetadata.storeName ?? "",
        storeEmail: storeMetadata.storeEmail ?? "",
        storePhone: storeMetadata.storePhone ?? "",
        address: storeMetadata.address ?? null,
      });
    }
  }, [storeMetadata]);

  useEffect(() => {
    if (brandSettings) {
      setLogoPosition((brandSettings.logoPosition as "left" | "center" | "right") ?? "center");
      setHeaderBgColor(brandSettings.headerBgColor ?? "#ffffff");
      setFooterText(brandSettings.footerText ?? "");
      setShowSocialLinks(brandSettings.showSocialLinks ?? true);
      setShowAddress(brandSettings.showAddress ?? true);
    }
  }, [brandSettings]);

  // Mutations
  const updateMetadataMut = (trpc.stores as any).updateMetadata.useMutation({
    onSuccess: () => {
      toast("Store details saved!", "success");
      (utils.stores as any).getMetadata.invalidate({ storeId });
    },
    onError: (err: { message?: string }) => toast(err.message || "Failed to save", "error"),
  }) as { mutate: (input: any) => void; isPending: boolean };

  const updateBrandSettingsMut = (trpc.ai as any).updateBrandSettings.useMutation({
    onSuccess: () => {
      toast("Brand settings saved!", "success");
      (utils.ai as any).getBrandSettings.invalidate({ storeId });
    },
    onError: (err: { message?: string }) => toast(err.message || "Failed to save", "error"),
  }) as { mutate: (input: any) => void; isPending: boolean };

  function handleSaveBrandSettings() {
    if (!storeId) return;
    updateBrandSettingsMut.mutate({
      storeId,
      logoPosition,
      headerBgColor: headerBgColor || null,
      footerText: footerText || null,
      showSocialLinks,
      showAddress,
    });
  }

  function handleSaveStoreDetails() {
    if (!storeId) return;
    updateMetadataMut.mutate({
      storeId,
      storeName: storeDetails.storeName || undefined,
      storeEmail: storeDetails.storeEmail || undefined,
      storePhone: storeDetails.storePhone || undefined,
      storeLogoUrl: logoUrl || null,
      socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
      address: storeDetails.address || undefined,
    });
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
          <Link href="/intelligence" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-[22px] tracking-[-0.5px] font-bold text-foreground font-mono">BRAND_VOICE</h1>
            <p className="text-[13px] text-muted-foreground font-mono mt-1">
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
          className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-[11px] font-mono hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
            <p className="text-[13px] font-bold text-blue-900 font-mono">Analyzing brand voice...</p>
            <p className="text-[11px] text-blue-600 font-mono mt-0.5">
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
            <p className="text-[13px] font-bold text-red-900 font-mono">Analysis failed</p>
            <p className="text-[11px] text-red-600 font-mono mt-0.5">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-[11px] text-red-400 hover:text-red-600 font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : profile ? (
        <div className="space-y-6">
          {/* Brand overview */}
          <div className="border border-border rounded-xl p-6 bg-card">
            <h2 className="text-[18px] tracking-[-0.5px] font-bold text-foreground font-mono mb-1">{profile.brandName}</h2>
            <p className="text-[13px] text-muted-foreground font-mono">{profile.brandDescription}</p>
            <p className="text-[10px] text-muted-foreground/50 font-mono mt-3">
              Last analyzed: {new Date(profile.analyzedAt).toLocaleString()}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Tone attributes */}
            <div className="border border-border rounded-xl p-6 bg-card">
              <div className="flex items-center gap-3 mb-4">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-[13px] font-bold text-foreground font-mono">TONE</h2>
              </div>
              {tone && (
                <div className="space-y-3">
                  {Object.entries(tone).map(([key, value]) => (
                    <div key={key}>
                      <div className="flex justify-between text-[11px] font-mono mb-1">
                        <span className="text-muted-foreground uppercase">{key}</span>
                        <span className="text-foreground font-bold">{value}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-secondary rounded-full transition-all"
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
            <div className="border border-border rounded-xl p-6 bg-card">
              <div className="flex items-center gap-3 mb-4">
                <Palette className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-[13px] font-bold text-foreground font-mono">VISUAL_STYLE</h2>
              </div>
              {visual && (
                <div className="space-y-4">
                  <div>
                    <span className="text-[11px] text-muted-foreground font-mono">AESTHETIC</span>
                    <p className="text-[13px] font-bold text-foreground font-mono mt-0.5">
                      {typeof visual["aesthetic"] === "string" ? visual["aesthetic"] : ""}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground font-mono">FONT STYLE</span>
                    <p className="text-[13px] font-bold text-foreground font-mono mt-0.5">
                      {typeof visual["fontStyle"] === "string" ? visual["fontStyle"] : ""}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground font-mono mb-2 block">COLORS</span>
                    <div className="flex gap-2">
                      {(Array.isArray(visual["suggestedColors"]) ? visual["suggestedColors"] : []).map((color, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <div
                            className="w-6 h-6 rounded-full border border-border"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-[10px] text-muted-foreground font-mono">{color}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Creative Intensity */}
          <div className="border border-border rounded-xl p-6 bg-card">
            <div className="flex items-center gap-3 mb-4">
              <Sliders className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-[13px] font-bold text-foreground font-mono">CREATIVE_INTENSITY</h2>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono mb-4">
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
                        ? "border-foreground shadow-[0_0_0_1px_hsl(var(--foreground))] bg-muted"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <p className="text-[11px] font-bold text-foreground font-mono">{opt.label}</p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-1">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vocabulary */}
          <div className="border border-border rounded-xl p-6 bg-card">
            <div className="flex items-center gap-3 mb-4">
              <Type className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-[13px] font-bold text-foreground font-mono">VOCABULARY</h2>
            </div>
            {vocabulary && (
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <span className="text-[11px] text-muted-foreground font-mono block mb-2">PREFERRED WORDS</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(vocabulary["preferredWords"] ?? []).map((word, i) => (
                      <span key={i} className="px-2 py-0.5 bg-muted text-foreground text-[11px] font-mono rounded">
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground font-mono block mb-2">CTA PATTERNS</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(vocabulary["ctaPatterns"] ?? []).map((cta, i) => (
                      <span key={i} className="px-2 py-0.5 bg-secondary text-secondary-foreground text-[11px] font-mono rounded">
                        {cta}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground font-mono block mb-2">BRAND TERMS</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(vocabulary["brandTerms"] ?? []).map((term, i) => (
                      <span key={i} className="px-2 py-0.5 bg-muted border border-border text-foreground text-[11px] font-mono rounded">
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
            <div className="border border-border rounded-xl p-6 bg-card">
              <div className="flex items-center gap-3 mb-4">
                <Quote className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-[13px] font-bold text-foreground font-mono">SAMPLE_COPY</h2>
              </div>
              <div className="space-y-3">
                {sampleCopy.map((copy, i) => (
                  <div key={i} className="p-3 bg-muted rounded-lg border-l-2 border-secondary">
                    <p className="text-[11px] text-foreground font-mono leading-relaxed">{copy}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* BRAND SETTINGS — Email Header / Footer / Assets                  */}
          {/* ================================================================ */}

          <div className="pt-4 border-t border-border">
            <h2 className="text-[16px] tracking-[-0.5px] font-bold text-foreground font-mono mb-1">EMAIL_SETTINGS</h2>
            <p className="text-[11px] text-muted-foreground font-mono mb-6">Hard parameters applied to every generated email</p>
          </div>

          {/* Logo & Header */}
          <div className="border border-border rounded-xl p-6 bg-card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Image className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-[13px] font-bold text-foreground font-mono">LOGO_&_HEADER</h2>
              </div>
              <button
                onClick={handleSaveBrandSettings}
                disabled={updateBrandSettingsMut.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg text-[10px] font-mono hover:bg-secondary/90 disabled:opacity-50 transition-all"
              >
                <Save className="w-3 h-3" />
                {updateBrandSettingsMut.isPending ? "Saving..." : "Save"}
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-muted-foreground font-mono block mb-1.5">LOGO URL</label>
                <div className="flex gap-3 items-start">
                  <input
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://cdn.shopify.com/your-logo.png"
                    className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg text-[12px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                  {logoUrl && (
                    <div className="w-16 h-16 border border-border rounded-lg overflow-hidden bg-white flex-shrink-0">
                      <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-mono block mb-1.5">LOGO POSITION</label>
                <div className="flex gap-2">
                  {(["left", "center", "right"] as const).map((pos) => (
                    <button
                      key={pos}
                      onClick={() => setLogoPosition(pos)}
                      className={`px-4 py-2 border rounded-lg text-[11px] font-mono transition-all ${
                        logoPosition === pos
                          ? "border-foreground bg-muted font-bold"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {pos.charAt(0).toUpperCase() + pos.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-mono block mb-1.5">HEADER BACKGROUND</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={headerBgColor}
                    onChange={(e) => setHeaderBgColor(e.target.value)}
                    className="w-8 h-8 rounded border border-border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={headerBgColor}
                    onChange={(e) => setHeaderBgColor(e.target.value)}
                    className="w-28 px-3 py-2 bg-muted border border-border rounded-lg text-[12px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer Defaults */}
          <div className="border border-border rounded-xl p-6 bg-card">
            <div className="flex items-center gap-3 mb-4">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-[13px] font-bold text-foreground font-mono">FOOTER_DEFAULTS</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-muted-foreground font-mono block mb-1.5">CUSTOM FOOTER TEXT</label>
                <textarea
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder="e.g. All rights reserved. Terms & conditions apply."
                  rows={2}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[12px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
                />
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <button
                    onClick={() => setShowAddress(!showAddress)}
                    className={`w-8 h-5 rounded-full transition-all flex items-center ${
                      showAddress ? "bg-secondary justify-end" : "bg-muted border border-border justify-start"
                    }`}
                  >
                    <div className="w-4 h-4 bg-white rounded-full shadow-sm mx-0.5" />
                  </button>
                  <span className="text-[11px] font-mono text-foreground">Show store address</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <button
                    onClick={() => setShowSocialLinks(!showSocialLinks)}
                    className={`w-8 h-5 rounded-full transition-all flex items-center ${
                      showSocialLinks ? "bg-secondary justify-end" : "bg-muted border border-border justify-start"
                    }`}
                  >
                    <div className="w-4 h-4 bg-white rounded-full shadow-sm mx-0.5" />
                  </button>
                  <span className="text-[11px] font-mono text-foreground">Show social links</span>
                </label>
              </div>
            </div>
          </div>

          {/* Social Links */}
          <div className="border border-border rounded-xl p-6 bg-card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Share2 className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-[13px] font-bold text-foreground font-mono">SOCIAL_LINKS</h2>
              </div>
              <button
                onClick={handleSaveStoreDetails}
                disabled={updateMetadataMut.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg text-[10px] font-mono hover:bg-secondary/90 disabled:opacity-50 transition-all"
              >
                <Save className="w-3 h-3" />
                {updateMetadataMut.isPending ? "Saving..." : "Save"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {["instagram", "facebook", "twitter", "tiktok", "pinterest", "youtube"].map((platform) => (
                <div key={platform}>
                  <label className="text-[10px] text-muted-foreground font-mono block mb-1 uppercase">{platform}</label>
                  <input
                    type="url"
                    value={socialLinks[platform] ?? ""}
                    onChange={(e) => setSocialLinks((prev) => ({ ...prev, [platform]: e.target.value }))}
                    placeholder={`https://${platform}.com/yourstore`}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[11px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Store Details */}
          <div className="border border-border rounded-xl p-6 bg-card">
            <div className="flex items-center gap-3 mb-4">
              <Store className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-[13px] font-bold text-foreground font-mono">STORE_DETAILS</h2>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono mb-4">Auto-populated from Shopify. Edit to override.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-muted-foreground font-mono block mb-1">STORE NAME</label>
                <input
                  type="text"
                  value={storeDetails.storeName}
                  onChange={(e) => setStoreDetails((prev) => ({ ...prev, storeName: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[12px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-secondary"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-mono block mb-1">EMAIL</label>
                <input
                  type="email"
                  value={storeDetails.storeEmail}
                  onChange={(e) => setStoreDetails((prev) => ({ ...prev, storeEmail: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[12px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-secondary"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-mono block mb-1">PHONE</label>
                <input
                  type="tel"
                  value={storeDetails.storePhone}
                  onChange={(e) => setStoreDetails((prev) => ({ ...prev, storePhone: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[12px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-secondary"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-mono block mb-1">ADDRESS</label>
                <input
                  type="text"
                  value={
                    storeDetails.address
                      ? [storeDetails.address.address1, storeDetails.address.city, storeDetails.address.province, storeDetails.address.zip, storeDetails.address.country].filter(Boolean).join(", ")
                      : ""
                  }
                  onChange={(e) => {
                    const parts = e.target.value.split(",").map((p) => p.trim());
                    setStoreDetails((prev) => ({
                      ...prev,
                      address: {
                        address1: parts[0] ?? "",
                        city: parts[1] ?? "",
                        province: parts[2] ?? "",
                        zip: parts[3] ?? "",
                        country: parts[4] ?? "",
                      },
                    }));
                  }}
                  placeholder="123 Main St, City, State, ZIP, Country"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[12px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-secondary"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-20 border border-border rounded-xl bg-card">
          <Palette className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-[13px] text-muted-foreground font-mono">No brand profile yet</p>
          <p className="text-[11px] text-muted-foreground/50 font-mono mt-1">
            Brand analysis runs automatically after Shopify sync, or click &quot;Re-analyze&quot;
          </p>
        </div>
      )}
    </div>
  );
}
