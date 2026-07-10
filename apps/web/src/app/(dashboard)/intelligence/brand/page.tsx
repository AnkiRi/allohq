"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, RefreshCw, Palette, Type, MessageSquare, Quote, AlertTriangle, Sliders, Image, MapPin, Share2, Store, Save, FileText } from "lucide-react";
import { ColorField } from "@/components/ui/ColorField";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { ModelSelector, type AIModelId } from "@/components/ai/ModelSelector";
import { motion } from "framer-motion";

const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const itemVariants = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } } };

function getToneBarColor(value: unknown): string {
  // Coerce: tone values aren't always strings (some profiles store numbers),
  // and value.toLowerCase() on a non-string was crashing the page.
  const v = String(value ?? "").toLowerCase();
  const high = ["casual", "warm", "high", "enthusiastic", "playful"];
  const medium = ["semi-formal", "light", "moderate", "friendly"];
  if (high.includes(v)) return "var(--color-success)";
  if (medium.includes(v)) return "var(--color-warning)";
  return "var(--color-urgent)";
}

export default function BrandProfilePage() {
  const { toast } = useToast();
  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";

  const [selectedModel, setSelectedModel] = useState<AIModelId>("claude-sonnet-5");
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
    data: { brandName: string; brandDescription: string | null; brandDocument: string | null; sendingFrequency: string | null; fromName: string | null; fromEmail: string | null; replyToEmail: string | null; toneAttributes: unknown; vocabulary: unknown; visualStyle: unknown; sampleCopy: unknown; analyzedAt: string } | null | undefined;
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
        ? "joon has hit its AI usage limit for now. Take a look at your billing settings."
        : reason.includes("API key") || reason.includes("apiKey")
          ? "joon can't find a valid AI key. Check your ANTHROPIC_API_KEY or OPENAI_API_KEY."
          : reason.includes("All AI models failed")
            ? "None of the AI models would respond. Check your API keys in your environment variables."
            : `Something went wrong: ${reason}`;
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
      toast("All done. joon has your brand down.", "success");
      return;
    }

    // Timeout after 90 seconds
    if (Date.now() - analyzeStartedAt.current > 90000) {
      setAnalyzing(false);
      setJobId(null);
      setError("This is taking longer than usual. It may still finish in the background. Try refreshing in a minute.");
      toast("This is taking a while. Try again in a minute.", "error");
    }
  }, [profile?.analyzedAt, jobStatus, analyzing, toast]);

  const utils = trpc.useUtils();
  const updateIntensityMut = (trpc.ai.updateCreativeIntensity as any).useMutation({
    onSuccess: () => {
      toast("Creative intensity updated.", "success");
      (utils.ai as any).brandProfile.invalidate({ storeId });
    },
    onError: (err: { message?: string }) => toast(err.message || "That didn't save. Give it another try.", "error"),
  }) as { mutate: (input: { storeId: string; creativeIntensity: string }) => void; isPending: boolean };

  const analyzeMut = trpc.ai.analyzeBrand.useMutation({
    onSuccess: (data) => {
      setAnalyzing(true);
      setError(null);
      setJobId(data.jobId ?? null);
      analyzeStartedAt.current = Date.now();
      prevAnalyzedAt.current = profile?.analyzedAt ?? null;
      toast("On it. joon needs about 15 seconds.", "info");
    },
    onError: (err) => {
      setError(err.message || "joon couldn't get started. Give it another try.");
      toast(err.message || "joon couldn't get started. Give it another try.", "error");
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
      toast("Store details saved.", "success");
      (utils.stores as any).getMetadata.invalidate({ storeId });
    },
    onError: (err: { message?: string }) => toast(err.message || "That didn't save. Give it another try.", "error"),
  }) as { mutate: (input: any) => void; isPending: boolean };

  const updateBrandSettingsMut = (trpc.ai as any).updateBrandSettings.useMutation({
    onSuccess: () => {
      toast("Brand settings saved.", "success");
      (utils.ai as any).getBrandSettings.invalidate({ storeId });
    },
    onError: (err: { message?: string }) => toast(err.message || "That didn't save. Give it another try.", "error"),
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

  const rawTone = profile?.toneAttributes;
  // Fix corrupted array data from old onboarding bug (stored Object.values instead of object)
  const tone: Record<string, string> | undefined = (() => {
    if (!rawTone) return undefined;
    if (Array.isArray(rawTone)) {
      // Reconstruct from known key order matching onboarding state init
      const keys = ["formality", "energy", "warmth", "humor"];
      const result: Record<string, string> = {};
      keys.forEach((k, i) => { if (rawTone[i]) result[k] = rawTone[i] as string; });
      return Object.keys(result).length > 0 ? result : undefined;
    }
    return rawTone as Record<string, string>;
  })();
  const vocabulary = profile?.vocabulary as Record<string, string[]> | undefined;
  const visual = profile?.visualStyle as Record<string, string | string[]> | undefined;
  const sampleCopy = profile?.sampleCopy as string[] | undefined;

  // Visual profile data
  const { data: visualProfile } = (trpc.ai as any).getBrandVisualProfile.useQuery(
    { storeId },
    { enabled: !!storeId },
  ) as { data: any | undefined };

  // Editable tone state
  const [editingTone, setEditingTone] = useState(false);
  const [toneEdits, setToneEdits] = useState<Record<string, string>>({});
  const [bannedWordsEdit, setBannedWordsEdit] = useState("");
  const [toneInitialized, setToneInitialized] = useState(false);
  const [guidelinesEdit, setGuidelinesEdit] = useState("");
  const [sendFreqEdit, setSendFreqEdit] = useState("balanced");
  const [fromNameEdit, setFromNameEdit] = useState("");
  const [fromEmailEdit, setFromEmailEdit] = useState("");
  const [replyToEdit, setReplyToEdit] = useState("");

  // Editable visual state
  const [editingVisual, setEditingVisual] = useState(false);
  const [aestheticEdit, setAestheticEdit] = useState("clean_minimal");
  const [colorTokens, setColorTokens] = useState<Record<string, string>>({});
  const [headingFont, setHeadingFont] = useState("");
  const [bodyFont, setBodyFont] = useState("");
  const [visualInitialized, setVisualInitialized] = useState(false);

  useEffect(() => {
    if (!toneInitialized && profile) {
      const defaults: Record<string, string> = { formality: "casual", energy: "moderate", warmth: "friendly", humor: "light" };
      setToneEdits(tone ? { ...defaults, ...tone } : defaults);
      const bw = (vocabulary?.["bannedWords"] as unknown as string[]) ?? [];
      setBannedWordsEdit(bw.join(", "));
      setGuidelinesEdit(profile.brandDocument ?? "");
      setSendFreqEdit(profile.sendingFrequency ?? "balanced");
      setFromNameEdit(profile.fromName ?? "");
      setFromEmailEdit(profile.fromEmail ?? "");
      setReplyToEdit(profile.replyToEmail ?? "");
      setToneInitialized(true);
    }
  }, [tone, vocabulary, toneInitialized, profile]);

  useEffect(() => {
    if (visualProfile && !visualInitialized) {
      setAestheticEdit(visualProfile.aestheticClassification ?? "clean_minimal");
      setColorTokens((visualProfile.brandDesignTokens as Record<string, string>) ?? {});
      setHeadingFont(visualProfile.fontFamily ?? "");
      setBodyFont(visualProfile.bodyFontFamily ?? "");
      setVisualInitialized(true);
    }
  }, [visualProfile, visualInitialized]);

  const updateVoiceMut = (trpc.ai as any).updateBrandVoice.useMutation({
    onSuccess: () => {
      toast("Brand voice updated.", "success");
      (utils.ai as any).brandProfile.invalidate({ storeId });
      setEditingTone(false);
    },
    onError: (err: { message?: string }) => toast(err.message || "That didn't save. Give it another try.", "error"),
  }) as { mutate: (input: any) => void; isPending: boolean };

  const handleSaveVoice = () => {
    updateVoiceMut.mutate({
      storeId,
      toneAttributes: toneEdits,
      vocabulary: {
        bannedWords: bannedWordsEdit.split(",").map((w: string) => w.trim()).filter(Boolean),
      },
      brandDocument: guidelinesEdit,
      sendingFrequency: sendFreqEdit,
      fromName: fromNameEdit,
      fromEmail: fromEmailEdit,
      replyToEmail: replyToEdit,
    });
  };

  const updateVisualMut = (trpc.ai as any).updateBrandVisualProfile.useMutation({
    onSuccess: () => {
      toast("Visual style updated.", "success");
      (utils.ai as any).getBrandVisualProfile.invalidate({ storeId });
      setEditingVisual(false);
    },
    onError: (err: { message?: string }) => toast(err.message || "That didn't save. Give it another try.", "error"),
  }) as { mutate: (input: any) => void; isPending: boolean };

  const handleSaveVisual = () => {
    updateVisualMut.mutate({
      storeId,
      aestheticClassification: aestheticEdit,
      brandDesignTokens: colorTokens,
      fontFamily: headingFont || null,
      bodyFontFamily: bodyFont || null,
    });
  };

  const AESTHETIC_OPTIONS = [
    { value: "clean_minimal", label: "Clean Minimal", desc: "Airy layouts, generous whitespace" },
    { value: "bold_graphic", label: "Bold Graphic", desc: "Strong colors, big type, high-contrast" },
    { value: "luxury_editorial", label: "Luxury Editorial", desc: "Refined, editorial layouts" },
    { value: "warm_organic", label: "Warm Organic", desc: "Earthy tones, natural textures" },
    { value: "playful_colorful", label: "Playful Colorful", desc: "Bright colors, fun typography" },
    { value: "tech_modern", label: "Tech Modern", desc: "Sleek gradients, geometric layouts" },
    { value: "heritage_artisanal", label: "Heritage Artisanal", desc: "Vintage feel, handcrafted touch" },
    { value: "premium_dtc", label: "Premium DTC", desc: "Contemporary, product-focused" },
  ];

  const COLOR_TOKEN_LABELS = [
    { key: "primaryBackground", label: "Primary BG" },
    { key: "accentColor", label: "Accent" },
    { key: "ctaBackground", label: "CTA BG" },
    { key: "ctaTextColor", label: "CTA Text" },
    { key: "textPrimary", label: "Text Primary" },
    { key: "textSecondary", label: "Text Secondary" },
  ];

  const TONE_DIMENSIONS = [
    {
      key: "formality",
      label: "Formality",
      left: { label: "Formal", example: "We are pleased to present our newest collection" },
      right: { label: "Casual", example: "You're going to love what we've been working on" },
      options: ["formal", "semi-formal", "casual", "very-casual"],
    },
    {
      key: "energy",
      label: "Energy",
      left: { label: "Calm", example: "Take your time exploring our curated range" },
      right: { label: "High Energy", example: "Don't miss out! Limited stock, grab yours now!" },
      options: ["calm", "moderate", "high", "intense"],
    },
    {
      key: "warmth",
      label: "Warmth",
      left: { label: "Professional", example: "We recommend this product based on your preferences" },
      right: { label: "Warm", example: "We think you'll love this, picked just for you" },
      options: ["professional", "friendly", "warm", "intimate"],
    },
    {
      key: "humor",
      label: "Humor",
      left: { label: "Serious", example: "Our premium collection is now available" },
      right: { label: "Playful", example: "Your cart misses you (seriously, it told us)" },
      options: ["none", "light", "moderate", "heavy"],
    },
  ];


  const isAnalyzing = analyzeMut.isPending || analyzing;

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/intelligence" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="section-header accent-bar-left text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">Brand voice</h1>
            <p className="text-[13px] text-muted-foreground font-sans mt-1">
              The personality joon picked up from your store, so everything it writes sounds like you.
            </p>
            <p className="text-[12px] text-muted-foreground/80 font-sans mt-1.5">
              This is your <span className="text-foreground font-medium">global default</span>. Any
              campaign, automation, or email can override it for a single send — without changing it here.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
        <ModelSelector value={selectedModel} onChange={setSelectedModel} compact />
        <button
          onClick={handleAnalyze}
          disabled={!storeId || isAnalyzing}
          title={!storeId ? "Connect a store first" : ""}
          className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-[11px] font-sans hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin" : ""}`} />
          {!storeId ? "Connect Store First" : isAnalyzing ? "Analyzing..." : "Re-analyze"}
        </button>
        </div>
      </motion.div>

      {/* Analyzing banner */}
      {analyzing && (
        <motion.div variants={itemVariants} className="glass-card-static border-l-4 border-l-[var(--color-accent)] flex items-center gap-3 px-4 py-3">
          <RefreshCw className="w-4 h-4 text-[var(--color-accent)] animate-spin flex-shrink-0" />
          <div>
            <p className="text-[13px] font-bold text-foreground">Reading your brand...</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              joon is going through your products to learn how your brand sounds and looks. This usually takes 10-20 seconds.
            </p>
          </div>
        </motion.div>
      )}

      {/* Error banner */}
      {error && !analyzing && (
        <motion.div variants={itemVariants} className="glass-card-static border-l-4 border-l-[var(--color-urgent)] flex items-center gap-3 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-[var(--color-urgent)] flex-shrink-0" />
          <div>
            <p className="text-[13px] font-bold text-foreground">That didn&apos;t go through</p>
            <p className="text-[11px] text-[var(--color-urgent)] mt-0.5">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-[11px] text-[var(--color-urgent)]/60 hover:text-[var(--color-urgent)] font-sans"
          >
            Dismiss
          </button>
        </motion.div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 glass-skeleton rounded-xl" />
          ))}
        </div>
      ) : profile ? (
        <motion.div className="space-y-6" variants={containerVariants} initial="hidden" animate="visible">
          {/* Brand overview */}
          <motion.div variants={itemVariants} className="glass-card-static p-6">
            <h2 className="text-[18px] tracking-[-0.5px] font-bold text-foreground font-serif mb-1">{profile.brandName}</h2>
            <p className="text-[13px] text-muted-foreground">{profile.brandDescription}</p>
            <p className="text-[10px] text-muted-foreground/50 mt-3">
              Last analyzed: {new Date(profile.analyzedAt).toLocaleString()}
            </p>
          </motion.div>

          {/* Brand guidelines — the raw source joon writes from (set at onboarding) */}
          <motion.div variants={itemVariants} className="glass-card-static p-6">
            <div className="flex items-center gap-3 mb-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <h2 className="section-header accent-bar-left text-[13px] font-bold text-foreground font-serif">Brand guidelines</h2>
            </div>
            <p className="text-[12px] text-muted-foreground mb-3">
              The raw guidelines joon reads from — pasted or uploaded at onboarding. Everything it writes respects this.
            </p>
            <textarea
              value={guidelinesEdit}
              onChange={(e) => setGuidelinesEdit(e.target.value)}
              rows={5}
              placeholder="Paste your brand guidelines, do's and don'ts, positioning notes…"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[13px] font-sans text-foreground leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={handleSaveVoice}
                disabled={updateVoiceMut.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-sans font-medium text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <Save className="w-3.5 h-3.5" />
                {updateVoiceMut.isPending ? "Saving…" : "Save guidelines"}
              </button>
            </div>
          </motion.div>

          {/* Sending & sender — global send defaults (per-campaign overridable) */}
          <motion.div variants={itemVariants} className="glass-card-static p-6">
            <div className="flex items-center gap-3 mb-1">
              <Share2 className="w-4 h-4 text-muted-foreground" />
              <h2 className="section-header accent-bar-left text-[13px] font-bold text-foreground font-serif">Sending &amp; sender</h2>
            </div>
            <p className="text-[12px] text-muted-foreground mb-4">
              Global defaults for how often joon reaches out and who emails come from. A
              campaign can still override these for one send.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] text-muted-foreground font-sans block mb-1.5">SENDING FREQUENCY</label>
                <select
                  value={sendFreqEdit}
                  onChange={(e) => setSendFreqEdit(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                >
                  <option value="minimal">Minimal — only the important moments</option>
                  <option value="balanced">Balanced — a steady, considered cadence</option>
                  <option value="frequent">Frequent — stay top of mind</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-sans block mb-1.5">FROM NAME</label>
                <input type="text" value={fromNameEdit} onChange={(e) => setFromNameEdit(e.target.value)} placeholder="e.g. Vana Naturals" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-sans block mb-1.5">FROM EMAIL</label>
                <input type="email" value={fromEmailEdit} onChange={(e) => setFromEmailEdit(e.target.value)} placeholder="hello@yourbrand.com" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-sans block mb-1.5">REPLY-TO EMAIL</label>
                <input type="email" value={replyToEdit} onChange={(e) => setReplyToEdit(e.target.value)} placeholder="care@yourbrand.com" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={handleSaveVoice}
                disabled={updateVoiceMut.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-sans font-medium text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <Save className="w-3.5 h-3.5" />
                {updateVoiceMut.isPending ? "Saving…" : "Save settings"}
              </button>
            </div>
          </motion.div>

          <div className="grid grid-cols-2 gap-6">
            {/* Tone attributes */}
            <motion.div variants={itemVariants} className="glass-card-static p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  <h2 className="section-header accent-bar-left text-[13px] font-bold text-foreground font-serif">Tone</h2>
                </div>
                {!editingTone ? (
                  <button
                    onClick={() => setEditingTone(true)}
                    className="text-[10px] font-sans text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setEditingTone(false); if (tone) setToneEdits(tone); }}
                      className="text-[10px] font-sans text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveVoice}
                      disabled={updateVoiceMut.isPending}
                      className="flex items-center gap-1 px-2.5 py-1 bg-secondary text-secondary-foreground rounded text-[10px] font-sans hover:bg-secondary/90 disabled:opacity-50 transition-all"
                    >
                      <Save className="w-3 h-3" />
                      {updateVoiceMut.isPending ? "Saving..." : "Save"}
                    </button>
                  </div>
                )}
              </div>
              {!editingTone && (
                <div className="space-y-3">
                  {TONE_DIMENSIONS.map((dim) => {
                    const value = tone?.[dim.key] ?? dim.options[1] ?? "";
                    const idx = dim.options.indexOf(value);
                    const pct = idx >= 0 ? ((idx + 1) / dim.options.length) * 100 : 50;
                    return (
                      <div key={dim.key}>
                        <div className="flex justify-between text-[11px] font-sans mb-1">
                          <span className="text-muted-foreground uppercase">{dim.label}</span>
                          <span className="text-foreground font-bold">{value}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ backgroundColor: getToneBarColor(value), width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-0.5">
                          <span className="text-[9px] text-muted-foreground/60 font-sans">{dim.left.label}</span>
                          <span className="text-[9px] text-muted-foreground/60 font-sans">{dim.right.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {editingTone && (
                <div className="space-y-5">
                  {TONE_DIMENSIONS.map((dim) => {
                    const currentVal = toneEdits[dim.key] ?? dim.options[1] ?? "";
                    const currentIdx = dim.options.indexOf(currentVal);
                    return (
                      <div key={dim.key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold text-foreground font-sans">{dim.label}</span>
                          <span className="text-[10px] text-[var(--color-accent)] font-sans font-medium">
                            {dim.options[currentIdx >= 0 ? currentIdx : 1]}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-muted-foreground font-sans w-16 text-right shrink-0">{dim.left.label}</span>
                          <input
                            type="range"
                            min={0}
                            max={dim.options.length - 1}
                            value={currentIdx >= 0 ? currentIdx : 1}
                            onChange={(e) => {
                              const val = dim.options[Number(e.target.value)];
                              if (val != null) setToneEdits((prev) => ({ ...prev, [dim.key]: val }));
                            }}
                            className="flex-1 h-1.5 accent-[var(--color-accent)] cursor-pointer"
                          />
                          <span className="text-[9px] text-muted-foreground font-sans w-16 shrink-0">{dim.right.label}</span>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[9px] text-muted-foreground/50 italic max-w-[45%]">&ldquo;{dim.left.example}&rdquo;</span>
                          <span className="text-[9px] text-muted-foreground/50 italic max-w-[45%] text-right">&ldquo;{dim.right.example}&rdquo;</span>
                        </div>
                      </div>
                    );
                  })}
                  <div>
                    <span className="text-[11px] text-muted-foreground font-sans uppercase block mb-1.5">BANNED WORDS</span>
                    <input
                      type="text"
                      value={bannedWordsEdit}
                      onChange={(e) => setBannedWordsEdit(e.target.value)}
                      placeholder="e.g. cheap, discount, limited time"
                      className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[11px] font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-secondary"
                    />
                    <p className="text-[9px] text-muted-foreground/50 mt-1">Separate with commas. joon will keep these words out of everything it writes.</p>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Visual style */}
            <motion.div variants={itemVariants} className="glass-card-static p-6">
              <div className="flex items-center gap-3 mb-4">
                <Palette className="w-4 h-4 text-muted-foreground" />
                <h2 className="section-header accent-bar-left text-[13px] font-bold text-foreground font-serif">Visual style</h2>
              </div>
              {visual && (
                <div className="space-y-4">
                  <div>
                    <span className="text-[11px] text-muted-foreground font-sans">AESTHETIC</span>
                    <p className="text-[13px] font-bold text-foreground mt-0.5">
                      {typeof visual["aesthetic"] === "string" ? visual["aesthetic"] : ""}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground font-sans">FONT STYLE</span>
                    <p className="text-[13px] font-bold text-foreground mt-0.5">
                      {typeof visual["fontStyle"] === "string" ? visual["fontStyle"] : ""}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground font-sans mb-2 block">COLORS</span>
                    <div className="flex gap-2">
                      {(Array.isArray(visual["suggestedColors"]) ? visual["suggestedColors"] : []).map((color, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <div
                            className="w-7 h-7 rounded-full border border-border"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-[10px] text-muted-foreground font-mono">{color}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          {/* Creative Intensity */}
          <motion.div variants={itemVariants} className="glass-card-static p-6">
            <div className="flex items-center gap-3 mb-4">
              <Sliders className="w-4 h-4 text-muted-foreground" />
              <h2 className="section-header accent-bar-left text-[13px] font-bold text-foreground font-serif">Creative intensity</h2>
            </div>
            <p className="text-[11px] text-muted-foreground mb-4">
              How much visual flair joon brings to the emails it writes.
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
                        ? "border-[var(--color-accent)] shadow-[0_0_0_1px_var(--color-accent)] bg-muted"
                        : "border-border bg-muted hover:border-border"
                    }`}
                  >
                    <p className="text-[11px] font-bold text-foreground">{opt.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Vocabulary */}
          <motion.div variants={itemVariants} className="glass-card-static p-6">
            <div className="flex items-center gap-3 mb-4">
              <Type className="w-4 h-4 text-muted-foreground" />
              <h2 className="section-header accent-bar-left text-[13px] font-bold text-foreground font-serif">Vocabulary</h2>
            </div>
            {vocabulary && (
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <span className="text-[11px] text-muted-foreground font-sans block mb-2">PREFERRED WORDS</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(vocabulary["preferredWords"] ?? []).map((word, i) => (
                      <span key={i} className="px-2 py-0.5 bg-muted border border-border text-foreground text-[11px] font-sans rounded">
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground font-sans block mb-2">CTA PATTERNS</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(vocabulary["ctaPatterns"] ?? []).map((cta, i) => (
                      <span key={i} className="px-2 py-0.5 bg-muted border border-border text-foreground text-[11px] font-sans rounded">
                        {cta}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground font-sans block mb-2">BRAND TERMS</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(vocabulary["brandTerms"] ?? []).map((term, i) => (
                      <span key={i} className="px-2 py-0.5 bg-muted border border-border text-foreground text-[11px] font-sans rounded">
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* Sample copy */}
          {sampleCopy && sampleCopy.length > 0 && (
            <motion.div variants={itemVariants} className="glass-card-static p-6">
              <div className="flex items-center gap-3 mb-4">
                <Quote className="w-4 h-4 text-muted-foreground" />
                <h2 className="section-header accent-bar-left text-[13px] font-bold text-foreground font-serif">Sample copy</h2>
              </div>
              <div className="space-y-3">
                {sampleCopy.map((copy, i) => (
                  <div key={i} className="p-3 bg-muted rounded-lg border-l-2 border-l-[var(--color-accent)]">
                    <p className="text-[11px] text-foreground leading-relaxed">{copy}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Visual Design */}
          <motion.div variants={itemVariants} className="glass-card-static p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Palette className="w-4 h-4 text-muted-foreground" />
                <h2 className="section-header accent-bar-left text-[13px] font-bold text-foreground font-serif">Visual design</h2>
              </div>
              {!editingVisual ? (
                <button
                  onClick={() => setEditingVisual(true)}
                  className="text-[10px] font-sans text-muted-foreground hover:text-foreground transition-colors"
                >
                  Edit
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditingVisual(false); if (visualProfile) { setAestheticEdit(visualProfile.aestheticClassification ?? "clean_minimal"); setColorTokens((visualProfile.brandDesignTokens as Record<string, string>) ?? {}); setHeadingFont(visualProfile.fontFamily ?? ""); setBodyFont(visualProfile.bodyFontFamily ?? ""); } }}
                    className="text-[10px] font-sans text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveVisual}
                    disabled={updateVisualMut.isPending}
                    className="flex items-center gap-1 px-2.5 py-1 bg-secondary text-secondary-foreground rounded text-[10px] font-sans hover:bg-secondary/90 disabled:opacity-50 transition-all"
                  >
                    <Save className="w-3 h-3" />
                    {updateVisualMut.isPending ? "Saving..." : "Save"}
                  </button>
                </div>
              )}
            </div>

            {!editingVisual ? (
              <div className="space-y-4">
                <div>
                  <span className="text-[11px] text-muted-foreground font-sans">AESTHETIC</span>
                  <p className="text-[13px] font-bold text-foreground mt-0.5">
                    {AESTHETIC_OPTIONS.find((a) => a.value === (visualProfile?.aestheticClassification ?? "clean_minimal"))?.label ?? visualProfile?.aestheticClassification ?? "Not set"}
                  </p>
                </div>
                {Object.keys(colorTokens).length > 0 && (
                  <div>
                    <span className="text-[11px] text-muted-foreground font-sans mb-2 block">BRAND COLORS</span>
                    <div className="flex gap-2 flex-wrap">
                      {COLOR_TOKEN_LABELS.map(({ key, label }) => colorTokens[key] ? (
                        <div key={key} className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: colorTokens[key] }} />
                          <span className="text-[10px] text-muted-foreground font-sans">{label}</span>
                        </div>
                      ) : null)}
                    </div>
                  </div>
                )}
                {(headingFont || bodyFont) && (
                  <div className="flex gap-6">
                    {headingFont && <div><span className="text-[11px] text-muted-foreground">HEADING FONT</span><p className="text-[12px] font-bold text-foreground mt-0.5">{headingFont}</p></div>}
                    {bodyFont && <div><span className="text-[11px] text-muted-foreground">BODY FONT</span><p className="text-[12px] font-bold text-foreground mt-0.5">{bodyFont}</p></div>}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {/* Aesthetic */}
                <div>
                  <span className="text-[11px] text-muted-foreground font-sans uppercase block mb-2">AESTHETIC</span>
                  <div className="grid grid-cols-2 gap-2">
                    {AESTHETIC_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setAestheticEdit(opt.value)}
                        className={`text-left px-3 py-2 border rounded-lg transition-all ${
                          aestheticEdit === opt.value
                            ? "border-[var(--color-accent)] shadow-[0_0_0_1px_var(--color-accent)] bg-muted"
                            : "border-border bg-muted hover:border-border"
                        }`}
                      >
                        <span className="text-[11px] font-bold text-foreground font-sans">{opt.label}</span>
                        <span className="text-[9px] text-muted-foreground block mt-0.5">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Colors */}
                <div>
                  <span className="text-[11px] text-muted-foreground font-sans uppercase block mb-2">BRAND COLORS</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {COLOR_TOKEN_LABELS.map(({ key, label }) => (
                      <div key={key}>
                        <label className="text-[10px] text-muted-foreground font-sans mb-1 block">{label}</label>
                        <ColorField
                          value={colorTokens[key] || "#000000"}
                          onChange={(v) => setColorTokens((prev) => ({ ...prev, [key]: v }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Typography */}
                <div>
                  <span className="text-[11px] text-muted-foreground font-sans uppercase block mb-2">TYPOGRAPHY</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground font-sans mb-1 block">Heading Font</label>
                      <input type="text" value={headingFont} onChange={(e) => setHeadingFont(e.target.value)} className="w-full px-2 py-1.5 text-[11px] font-sans rounded border border-border bg-muted text-foreground" placeholder="e.g. Playfair Display" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground font-sans mb-1 block">Body Font</label>
                      <input type="text" value={bodyFont} onChange={(e) => setBodyFont(e.target.value)} className="w-full px-2 py-1.5 text-[11px] font-sans rounded border border-border bg-muted text-foreground" placeholder="e.g. Inter" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* ================================================================ */}
          {/* BRAND SETTINGS — Email Header / Footer / Assets                  */}
          {/* ================================================================ */}

          <motion.div variants={itemVariants} className="pt-4 border-t border-border">
            <h2 className="section-header accent-bar-left text-[16px] tracking-[-0.5px] font-bold text-foreground font-serif mb-1">Email settings</h2>
            <p className="text-[11px] text-muted-foreground font-sans mb-6">The fixed details joon applies to every email it sends.</p>
          </motion.div>

          {/* Logo & Header */}
          <motion.div variants={itemVariants} className="glass-card-static p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Image className="w-4 h-4 text-muted-foreground" />
                <h2 className="section-header accent-bar-left text-[13px] font-bold text-foreground font-serif">Logo & header</h2>
              </div>
              <button
                onClick={handleSaveBrandSettings}
                disabled={updateBrandSettingsMut.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg text-[10px] font-sans hover:bg-secondary/90 disabled:opacity-50 transition-all"
              >
                <Save className="w-3 h-3" />
                {updateBrandSettingsMut.isPending ? "Saving..." : "Save"}
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-muted-foreground font-sans block mb-1.5">LOGO URL</label>
                <div className="flex gap-3 items-start">
                  <input
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://cdn.shopify.com/your-logo.png"
                    className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg text-[12px] font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                  {logoUrl && (
                    <div className="w-16 h-16 border border-border rounded-lg overflow-hidden bg-white flex-shrink-0">
                      <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-sans block mb-1.5">LOGO POSITION</label>
                <div className="flex gap-2">
                  {(["left", "center", "right"] as const).map((pos) => (
                    <button
                      key={pos}
                      onClick={() => setLogoPosition(pos)}
                      className={`px-4 py-2 border rounded-lg text-[11px] font-sans transition-all ${
                        logoPosition === pos
                          ? "border-[var(--color-accent)] shadow-[0_0_0_1px_var(--color-accent)] bg-muted font-bold"
                          : "border-border bg-muted hover:border-border"
                      }`}
                    >
                      {pos.charAt(0).toUpperCase() + pos.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-sans block mb-1.5">HEADER BACKGROUND</label>
                <ColorField
                  value={headerBgColor}
                  onChange={setHeaderBgColor}
                  className="max-w-xs"
                />
              </div>
            </div>
          </motion.div>

          {/* Footer Defaults */}
          <motion.div variants={itemVariants} className="glass-card-static p-6">
            <div className="flex items-center gap-3 mb-4">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <h2 className="section-header accent-bar-left text-[13px] font-bold text-foreground font-serif">Footer defaults</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-muted-foreground font-sans block mb-1.5">CUSTOM FOOTER TEXT</label>
                <textarea
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder="e.g. All rights reserved. Terms & conditions apply."
                  rows={2}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[12px] font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
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
                  <span className="text-[11px] font-sans text-foreground">Show store address</span>
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
                  <span className="text-[11px] font-sans text-foreground">Show social links</span>
                </label>
              </div>
            </div>
          </motion.div>

          {/* Social Links */}
          <motion.div variants={itemVariants} className="glass-card-static p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Share2 className="w-4 h-4 text-muted-foreground" />
                <h2 className="section-header accent-bar-left text-[13px] font-bold text-foreground font-serif">Social links</h2>
              </div>
              <button
                onClick={handleSaveStoreDetails}
                disabled={updateMetadataMut.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg text-[10px] font-sans hover:bg-secondary/90 disabled:opacity-50 transition-all"
              >
                <Save className="w-3 h-3" />
                {updateMetadataMut.isPending ? "Saving..." : "Save"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {["instagram", "facebook", "twitter", "tiktok", "pinterest", "youtube"].map((platform) => (
                <div key={platform}>
                  <label className="text-[10px] text-muted-foreground font-sans block mb-1 uppercase">{platform}</label>
                  <input
                    type="url"
                    value={socialLinks[platform] ?? ""}
                    onChange={(e) => setSocialLinks((prev) => ({ ...prev, [platform]: e.target.value }))}
                    placeholder={`https://${platform}.com/yourstore`}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[11px] font-sans text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>
              ))}
            </div>
          </motion.div>

          {/* Store Details */}
          <motion.div variants={itemVariants} className="glass-card-static p-6">
            <div className="flex items-center gap-3 mb-4">
              <Store className="w-4 h-4 text-muted-foreground" />
              <h2 className="section-header accent-bar-left text-[13px] font-bold text-foreground font-serif">Store details</h2>
            </div>
            <p className="text-[10px] text-muted-foreground mb-4">Pulled in from Shopify. Edit anything you&apos;d like to change.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-muted-foreground font-sans block mb-1">STORE NAME</label>
                <input
                  type="text"
                  value={storeDetails.storeName}
                  onChange={(e) => setStoreDetails((prev) => ({ ...prev, storeName: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[12px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-secondary"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-sans block mb-1">EMAIL</label>
                <input
                  type="email"
                  value={storeDetails.storeEmail}
                  onChange={(e) => setStoreDetails((prev) => ({ ...prev, storeEmail: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[12px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-secondary"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-sans block mb-1">PHONE</label>
                <input
                  type="tel"
                  value={storeDetails.storePhone}
                  onChange={(e) => setStoreDetails((prev) => ({ ...prev, storePhone: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[12px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-secondary"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-sans block mb-1">ADDRESS</label>
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
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[12px] font-sans text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-secondary"
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="text-center py-20 glass-card-static">
          <Palette className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-[13px] text-muted-foreground">No brand profile yet.</p>
          <p className="text-[11px] text-muted-foreground/50 font-sans mt-1">
            joon builds this on its own after your Shopify sync. Or hit &quot;Re-analyze&quot; above to start now.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
