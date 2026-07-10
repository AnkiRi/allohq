"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Check,
  Package,
  Users,
  ShoppingBag,
  MessageSquare,
  Palette,
  Image,
  BarChart3,
  Boxes,
  Sparkles,
  Shield,
  ShieldCheck,
  FileText,
  Zap,
  ChevronRight,
  Type,
  Quote,
  Ban,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PHASES = [
  { label: "Getting to know your store", steps: [0, 1] },
  { label: "Setting joon up", steps: [2, 3, 4, 5] },
  { label: "What joon found", steps: [6, 7] },
] as const;

const AESTHETIC_OPTIONS = [
  {
    value: "clean_minimal",
    label: "Clean Minimal",
    desc: "Airy layouts, generous whitespace, subtle typography",
    bestFor: "Skincare, wellness, home goods",
    exampleSubject: "A quieter way to start your morning",
    exampleCTA: "Shop the Edit",
  },
  {
    value: "bold_graphic",
    label: "Bold Graphic",
    desc: "Strong colors, big type, high-contrast hero images",
    bestFor: "Streetwear, fitness, lifestyle brands",
    exampleSubject: "DROP ALERT: New arrivals just landed",
    exampleCTA: "Grab Yours Now",
  },
  {
    value: "luxury_editorial",
    label: "Luxury Editorial",
    desc: "Refined, editorial layouts with elegant serif headings",
    bestFor: "Jewelry, fashion, premium home goods",
    exampleSubject: "The Spring Edit: Curated for You",
    exampleCTA: "Discover the Collection",
  },
  {
    value: "warm_organic",
    label: "Warm Organic",
    desc: "Earthy tones, rounded elements, natural textures",
    bestFor: "Food, beauty, artisan products",
    exampleSubject: "Handcrafted with care, just for you",
    exampleCTA: "Explore Our Range",
  },
  {
    value: "playful_colorful",
    label: "Playful Colorful",
    desc: "Bright palette, fun icons, energetic layouts",
    bestFor: "Kids, pets, novelty, gifting",
    exampleSubject: "Something fun is waiting in your inbox!",
    exampleCTA: "Let's Go!",
  },
  {
    value: "tech_modern",
    label: "Tech Modern",
    desc: "Dark mode option, clean lines, monospace accents",
    bestFor: "Electronics, SaaS, gadgets",
    exampleSubject: "Upgrade your setup: new tech inside",
    exampleCTA: "View Specs",
  },
  {
    value: "heritage_artisanal",
    label: "Heritage Artisanal",
    desc: "Classic serifs, muted palette, vintage-inspired details",
    bestFor: "Leather goods, spirits, specialty crafts",
    exampleSubject: "Craftsmanship that stands the test of time",
    exampleCTA: "See the Story",
  },
  {
    value: "premium_dtc",
    label: "Premium DTC",
    desc: "Modern sans-serif, product-forward, conversion-optimized",
    bestFor: "DTC brands, supplements, apparel",
    exampleSubject: "Your favorites are back. Don't wait",
    exampleCTA: "Shop Now",
  },
] as const;

const AUTONOMY_CATEGORIES = [
  { key: "cart_recovery", label: "Cart recovery", desc: "Win back shoppers who left items behind" },
  { key: "win_back", label: "Win back", desc: "Reconnect with customers who are drifting away" },
  { key: "post_purchase", label: "Post purchase", desc: "Follow up warmly after an order" },
  { key: "vip", label: "VIP", desc: "Look after your best customers" },
] as const;

const TIER_OPTIONS = [
  { value: "autopilot", label: "Autopilot", desc: "joon acts on its own" },
  { value: "copilot", label: "Co-pilot", desc: "joon suggests, you approve" },
  { value: "advisor", label: "Advisor", desc: "joon only advises" },
] as const;

const COLOR_TOKENS = [
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
    left: { value: "formal", label: "Formal", example: "We are pleased to present our newest collection" },
    right: { value: "casual", label: "Casual", example: "You're going to love what we've been working on" },
    options: ["formal", "semi-formal", "casual", "very-casual"],
  },
  {
    key: "energy",
    label: "Energy",
    left: { value: "calm", label: "Calm", example: "Take your time exploring our thoughtfully curated range" },
    right: { value: "intense", label: "High Energy", example: "Don't miss out! Limited stock, grab yours now!" },
    options: ["calm", "moderate", "high", "intense"],
  },
  {
    key: "warmth",
    label: "Warmth",
    left: { value: "professional", label: "Professional", example: "We recommend this product based on your preferences" },
    right: { value: "intimate", label: "Warm", example: "We think you'll absolutely love this, picked just for you" },
    options: ["professional", "friendly", "warm", "intimate"],
  },
  {
    key: "humor",
    label: "Humor",
    left: { value: "none", label: "Serious", example: "Our premium collection is now available for purchase" },
    right: { value: "heavy", label: "Playful", example: "Your cart misses you (seriously, it told us)" },
    options: ["none", "light", "moderate", "heavy"],
  },
] as const;

function getSampleCopy(tone: Record<string, string>) {
  const isF = tone["formality"] === "formal" || tone["formality"] === "semi-formal";
  const isH = tone["energy"] === "high" || tone["energy"] === "intense";
  const isW = tone["warmth"] === "warm" || tone["warmth"] === "intimate";
  const isP = tone["humor"] === "moderate" || tone["humor"] === "heavy";

  return {
    subject: isH
      ? "Your favorites are back. Don't wait!"
      : isP
        ? "Guess what just dropped? (hint: you'll love it)"
        : isF
          ? "Introducing our latest arrivals"
          : "Something new, just for you",
    cta: isH ? "Shop Now" : isW ? "Take a Look" : isF ? "View Collection" : "See What's New",
    body: isW
      ? "We know how much you loved our bestseller, and we think this new addition is going to be your next favorite."
      : isP
        ? "Plot twist: we made something even better. Your move."
        : isF
          ? "We are delighted to introduce the newest addition to our range, designed with care and precision."
          : "Here's something we think you'll enjoy, fresh off the line and ready for you.",
  };
}

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const slideVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0, transition: { duration: 0.35, ease: "easeOut" } },
  exit: { opacity: 0, x: -40, transition: { duration: 0.2 } },
};

// ---------------------------------------------------------------------------
// OnboardingWizard — the main exported component
// ---------------------------------------------------------------------------

export function OnboardingWizard({
  storeId,
  onComplete,
}: {
  storeId: string;
  onComplete: () => void;
}) {
  // Onboarding status — polls every 3s during background analysis step
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const { data: status, refetch: refetchStatus } = trpc.onboarding.status.useQuery(
    { storeId },
    { enabled: !!storeId, refetchInterval: currentStep === 1 ? 3000 : false },
  );

  // Sync currentStep from server
  useEffect(() => {
    if (status?.currentStep != null) {
      setCurrentStep(status.currentStep);
    }
  }, [status?.currentStep]);

  // Mutations
  const advance = trpc.onboarding.advance.useMutation({ onSuccess: () => refetchStatus() });
  const saveBrandReview = trpc.onboarding.saveBrandReview.useMutation({ onSuccess: () => refetchStatus() });
  const saveAutonomySetup = trpc.onboarding.saveAutonomySetup.useMutation({ onSuccess: () => refetchStatus() });
  const saveGuardrails = trpc.onboarding.saveGuardrails.useMutation({ onSuccess: () => refetchStatus() });
  const acknowledgeReport = trpc.onboarding.acknowledgeReport.useMutation({ onSuccess: () => refetchStatus() });
  const complete = trpc.onboarding.complete.useMutation({ onSuccess: () => onComplete() });
  const goBack = trpc.onboarding.goBack.useMutation({ onSuccess: () => refetchStatus() });

  // Step 0→1: auto-advance when store is connected
  useEffect(() => {
    if (currentStep === 0 && storeId) {
      advance.mutate({ storeId, step: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, storeId]);

  // Loading
  if (currentStep === null) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#8B8074]" />
      </div>
    );
  }

  return (
    <div className="aurora-canvas-light max-w-3xl mx-auto py-4 sm:py-8">
      <PhaseIndicator currentStep={currentStep} />
      <AnimatePresence mode="wait">
        {currentStep === 1 && (
          <StepWrapper key="step1">
            <BackgroundAnalysisStep status={status} onContinue={() => advance.mutate({ storeId, step: 2 })} isAdvancing={advance.isPending} />
          </StepWrapper>
        )}
        {currentStep === 2 && (
          <StepWrapper key="step2">
            <ModelSelectionStep onContinue={() => advance.mutate({ storeId, step: 3 })} isAdvancing={advance.isPending} />
          </StepWrapper>
        )}
        {currentStep === 3 && (
          <StepWrapper key="step3">
            <BrandReviewStep storeId={storeId} onSave={saveBrandReview} onBack={() => goBack.mutate({ storeId, step: 2 })} />
          </StepWrapper>
        )}
        {currentStep === 4 && (
          <StepWrapper key="step4">
            <AutonomyStep storeId={storeId} onSave={saveAutonomySetup} onBack={() => goBack.mutate({ storeId, step: 3 })} />
          </StepWrapper>
        )}
        {currentStep === 5 && (
          <StepWrapper key="step5">
            <GuardrailsStep storeId={storeId} onSave={saveGuardrails} onBack={() => goBack.mutate({ storeId, step: 4 })} />
          </StepWrapper>
        )}
        {currentStep === 6 && (
          <StepWrapper key="step6">
            <StoreReportStep storeId={storeId} onAcknowledge={() => acknowledgeReport.mutate({ storeId })} isAdvancing={acknowledgeReport.isPending} onBack={() => goBack.mutate({ storeId, step: 5 })} />
          </StepWrapper>
        )}
        {currentStep === 7 && (
          <StepWrapper key="step7">
            <FirstActionsStep storeId={storeId} onComplete={() => complete.mutate({ storeId })} isCompleting={complete.isPending} onBack={() => goBack.mutate({ storeId, step: 6 })} />
          </StepWrapper>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase Indicator
// ---------------------------------------------------------------------------

function PhaseIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
      {PHASES.map((phase, i) => {
        const isActive = phase.steps.some((s) => s === currentStep);
        const isDone = phase.steps.every((s) => s < currentStep);
        return (
          <div key={i} className="flex items-center gap-2 shrink-0">
            {i > 0 && <div className={`w-6 h-px ${isDone ? "bg-[#1F7A4F]" : "bg-[#EDE7DB]"}`} />}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? "bg-[#1F7A4F]/10 text-[#1F7A4F] border border-[#1F7A4F]/30"
                  : isDone
                    ? "bg-[#1F7A4F]/5 text-[#1F7A4F]"
                    : "text-[#8B8074]"
              }`}
            >
              {isDone ? <Check className="w-3 h-3" /> : <span className="w-4 text-center">{i + 1}</span>}
              {phase.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={slideVariants} initial="enter" animate="center" exit="exit">
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Background Analysis
// ---------------------------------------------------------------------------

type StatusData = {
  counts: { products: number; customers: number; orders: number };
  syncComplete: boolean;
  brandVoiceComplete: boolean;
  brandVisualComplete: boolean;
  productImagesComplete: boolean;
  rfmComplete: boolean;
  baselineComplete: boolean;
};

function BackgroundAnalysisStep({
  status,
  onContinue,
  isAdvancing,
}: {
  status: StatusData | undefined;
  onContinue: () => void;
  isAdvancing: boolean;
}) {
  const productsDone = (status?.counts.products ?? 0) > 0;
  const syncRows = [
    { icon: Package, label: "Syncing products", count: status?.counts.products, done: productsDone },
    { icon: Users, label: "Syncing customers", count: status?.counts.customers, done: (status?.counts.customers ?? 0) > 0 },
    { icon: ShoppingBag, label: "Syncing orders", count: status?.counts.orders, done: productsDone },
  ];
  const analysisRows = [
    { icon: MessageSquare, label: "Analyzing brand voice", done: status?.brandVoiceComplete ?? false },
    { icon: Palette, label: "Extracting visual identity", done: status?.brandVisualComplete ?? false },
    { icon: Image, label: "Processing product images", done: status?.productImagesComplete ?? false },
    { icon: BarChart3, label: "Scoring customer health (RFM)", done: status?.rfmComplete ?? false },
    { icon: Boxes, label: "Capturing baseline metrics", done: status?.baselineComplete ?? false },
  ];
  const syncDone = syncRows.every((r) => r.done);
  const analysisDone = analysisRows.every((r) => r.done);
  // Only the DATA SYNC gates Continue. The background analysis (brand voice, RFM,
  // etc.) finishes on its own and can be re-run later from its page — so a single
  // failed/slow analysis job must NOT trap the merchant in onboarding forever.
  const canContinue = syncDone;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#2C2C2C] mb-1">joon is getting to know your store</h2>
        <p className="text-sm text-[#8B8074]">We&apos;re bringing in your data and learning the details. This usually takes a minute or two.</p>
      </div>
      <div className="glass-card-static rounded-xl p-5 space-y-3">
        {syncRows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            {row.done ? (
              <div className="w-6 h-6 rounded-full bg-[#1F7A4F]/10 flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-[#1F7A4F]" />
              </div>
            ) : (
              <Loader2 className="w-6 h-6 animate-spin text-[#8B8074]" />
            )}
            <span className={`text-sm ${row.done ? "text-[#2C2C2C]" : "text-[#8B8074]"}`}>
              {row.label}
              {row.count != null && row.count > 0 && (
                <span className="ml-1 text-[#1F7A4F] font-medium">({row.count} found)</span>
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="glass-card-static rounded-xl p-5 space-y-3">
        <p className="text-xs font-medium text-[#8B8074] uppercase tracking-wide mb-1">What joon is learning {analysisDone ? "(done)" : "(in the background)"}</p>
        {analysisRows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            {row.done ? (
              <div className="w-6 h-6 rounded-full bg-[#1F7A4F]/10 flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-[#1F7A4F]" />
              </div>
            ) : (
              <Loader2 className="w-6 h-6 animate-spin text-[#8B8074]" />
            )}
            <span className={`text-sm ${row.done ? "text-[#2C2C2C]" : "text-[#8B8074]"}`}>{row.label}</span>
          </div>
        ))}
      </div>
      {syncDone && !analysisDone && (
        <p className="text-xs text-[#8B8074]">Your data&apos;s in. joon is still learning your brand and scoring customers in the background — you can continue; it&apos;ll be ready shortly (and you can re-run it anytime from Brand Voice).</p>
      )}
      <div className="flex justify-end">
        <button onClick={onContinue} disabled={!canContinue || isAdvancing} className="flex items-center gap-2 px-5 py-2.5 bg-[#2C2C2C] text-white text-sm rounded-lg hover:bg-[#1a1a1a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {isAdvancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          Continue
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Model Selection
// ---------------------------------------------------------------------------

function ModelSelectionStep({
  onContinue,
  isAdvancing,
}: {
  onContinue: () => void;
  isAdvancing: boolean;
}) {
  const { data: models } = trpc.ai.models.useQuery();
  const { data: settings } = trpc.ai.getSettings.useQuery();
  const setDefault = trpc.ai.setDefaultModel.useMutation();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (settings?.defaultModel) setSelected(settings.defaultModel);
  }, [settings?.defaultModel]);

  const handleSelect = async (modelId: string) => {
    setSelected(modelId);
    await setDefault.mutateAsync({ model: modelId });
  };

  const tierColors: Record<string, string> = {
    premium: "bg-amber-100 text-amber-800",
    standard: "bg-blue-100 text-blue-800",
    economy: "bg-green-100 text-green-800",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#2C2C2C] mb-1">Choose the model joon runs on</h2>
        <p className="text-sm text-[#8B8074]">This is the brain behind joon&apos;s emails, customer analysis, and the actions it takes for you.</p>
      </div>
      <div className="grid gap-3">
        {models
          ?.filter((m: any) => m.available)
          .map((model: any) => {
            const isSelected = selected === model.id;
            return (
              <button
                key={model.id}
                onClick={() => handleSelect(model.id)}
                className={`relative rounded-xl p-4 text-left transition-all ${
                  isSelected
                    ? "border-2 border-[#1F7A4F] bg-[#1F7A4F]/5 shadow-sm"
                    : "border border-[#EDE7DB] bg-white/30 backdrop-blur-sm hover:bg-white/50"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#1F7A4F] flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div className="flex items-center gap-2 mb-1 pr-8">
                  <span className="text-sm font-medium text-[#2C2C2C]">{model.label}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${tierColors[model.tier] ?? ""}`}>
                    {model.tier}
                  </span>
                </div>
                <p className="text-xs text-[#8B8074]">{model.description}</p>
                <p className="text-[10px] text-[#A09888] mt-1">
                  ₹{model.inputCostPerMillion}/M input · ₹{model.outputCostPerMillion}/M output
                </p>
              </button>
            );
          })}
      </div>
      <div className="flex justify-end">
        <button onClick={onContinue} disabled={!selected || isAdvancing} className="flex items-center gap-2 px-5 py-2.5 bg-[#2C2C2C] text-white text-sm rounded-lg hover:bg-[#1a1a1a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {isAdvancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          Continue
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Brand Review
// ---------------------------------------------------------------------------

function BrandReviewStep({
  storeId,
  onSave,
  onBack,
}: {
  storeId: string;
  onSave: { mutate: (input: any) => void; isPending: boolean };
  onBack?: () => void;
}) {
  const { data: reviewData, isLoading, refetch: refetchReviewData } = (trpc as any).onboarding.getBrandReviewData.useQuery(
    { storeId },
    { enabled: !!storeId },
  ) as { data: any; isLoading: boolean; refetch: () => void };

  const bp = reviewData?.brandProfile;
  const vp = reviewData?.visualProfile;

  const [tone, setTone] = useState<Record<string, string>>({
    formality: "casual",
    energy: "moderate",
    warmth: "friendly",
    humor: "light",
  });

  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [aesthetic, setAesthetic] = useState("clean_minimal");
  const [bannedWords, setBannedWords] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [brandDocument, setBrandDocument] = useState("");
  const [sendFreq, setSendFreq] = useState("balanced");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);

  useEffect(() => {
    if (!initialized && (bp || vp)) {
      if (bp?.toneAttributes) {
        const ta = bp.toneAttributes as Record<string, string>;
        setTone((prev) => ({
          ...prev,
          formality: ta.formality ?? prev.formality ?? "casual",
          energy: ta.energy ?? prev.energy ?? "moderate",
          warmth: ta.warmth ?? prev.warmth ?? "friendly",
          humor: ta.humor ?? prev.humor ?? "light",
        }));
      }
      if (bp?.vocabulary) {
        const vocab = bp.vocabulary as Record<string, unknown>;
        const bw = vocab.bannedWords as string[] | undefined;
        if (bw?.length) setBannedWords(bw.join(", "));
      }
      if (vp) {
        const t = (vp.brandDesignTokens as Record<string, string>) ?? {};
        setTokens(t);
        setAesthetic(vp.aestheticClassification ?? "clean_minimal");
      }
      setInitialized(true);
    }
  }, [bp, vp, initialized]);

  // Load existing brand document
  useEffect(() => {
    if (bp?.brandDocument && !brandDocument) {
      setBrandDocument(bp.brandDocument as string);
    }
  }, [bp]);

  // Load existing send/sender settings
  useEffect(() => {
    if (bp) {
      if (bp.sendingFrequency) setSendFreq(bp.sendingFrequency as string);
      if (bp.fromName) setFromName(bp.fromName as string);
      if (bp.fromEmail) setFromEmail(bp.fromEmail as string);
      if (bp.replyToEmail) setReplyTo(bp.replyToEmail as string);
    }
  }, [bp]);

  const saveBrandDocMut = (trpc as any).onboarding.saveBrandDocument.useMutation();

  const handleAnalyzeFromDocument = async () => {
    setIsAnalyzing(true);
    try {
      const result = await saveBrandDocMut.mutateAsync({ storeId, document: brandDocument });
      // Apply returned brand profile to UI immediately
      if (result.brandProfile) {
        const ta = result.brandProfile.toneAttributes as Record<string, string> | null;
        if (ta) {
          setTone({
            formality: ta.formality ?? "casual",
            energy: ta.energy ?? "moderate",
            warmth: ta.warmth ?? "friendly",
            humor: ta.humor ?? "light",
          });
        }
        const vocab = result.brandProfile.vocabulary as Record<string, unknown> | null;
        if (vocab?.bannedWords) {
          setBannedWords((vocab.bannedWords as string[]).join(", "));
        }
      }
      // Refetch server data so "What Joon Found" section updates too
      refetchReviewData();
      setIsAnalyzing(false);
      setAnalysisDone(true);
      setTimeout(() => setAnalysisDone(false), 5000);
    } catch {
      setIsAnalyzing(false);
    }
  };

  const updateToken = (key: string, value: string) => {
    setTokens((prev) => ({ ...prev, [key]: value }));
  };

  const sampleCopy = useMemo(() => getSampleCopy(tone), [tone]);

  const handleSave = () => {
    onSave.mutate({
      storeId,
      aestheticClassification: aesthetic,
      brandDesignTokens: tokens,
      toneAttributes: Object.keys(tone).length > 0 ? tone : undefined,
      bannedWords: bannedWords.split(",").map((w) => w.trim()).filter(Boolean),
      sendingFrequency: sendFreq,
      fromName: fromName || undefined,
      fromEmail: fromEmail || undefined,
      replyToEmail: replyTo || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#8B8074]" />
        <span className="ml-3 text-sm text-[#8B8074]">Loading what joon found...</span>
      </div>
    );
  }

  const toneSummary = (() => {
    const fMap: Record<string, string> = { formal: "formal and polished", "semi-formal": "professional yet approachable", casual: "friendly and conversational", "very-casual": "relaxed and informal" };
    const wMap: Record<string, string> = { professional: "keeps a professional distance", friendly: "feels approachable", warm: "creates a sense of personal connection", intimate: "speaks directly to each customer like a friend" };
    const eMap: Record<string, string> = { calm: "with a calm, measured pace", moderate: "with balanced energy", high: "with enthusiasm and energy", intense: "with urgency and excitement" };
    return `Your brand communicates in a ${fMap[tone["formality"] ?? "casual"] ?? "conversational"} tone that ${wMap[tone["warmth"] ?? "friendly"] ?? "feels approachable"}, ${eMap[tone["energy"] ?? "moderate"] ?? "with balanced energy"}.`;
  })();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#2C2C2C] mb-1">Review your brand</h2>
        <p className="text-sm text-[#8B8074]">
          Here&apos;s the brand identity joon picked up from your store. Adjust anything that doesn&apos;t feel right.
        </p>
      </div>

      {/* Brand Document Upload */}
      <div className="mb-8 p-6 bg-[#FAF9F7] rounded-xl border border-[#E8E4DE]">
        <h3 className="text-lg font-semibold text-[#2D2A26] mb-2">Brand guidelines</h3>
        <p className="text-sm text-[#8B8074] mb-4">
          Already have brand guidelines? Paste them here and joon will follow them as the source of truth for your voice,
          ahead of anything it picked up on its own.
        </p>
        <textarea
          value={brandDocument}
          onChange={(e) => setBrandDocument(e.target.value)}
          placeholder="Paste your tone of voice, personality, guidelines, or any brand document here..."
          className="w-full h-40 p-4 border border-[#E8E4DE] rounded-lg text-sm bg-white resize-y focus:outline-none focus:ring-2 focus:ring-[#8B8074]/30"
        />
        {brandDocument.trim() && (
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={handleAnalyzeFromDocument}
              disabled={isAnalyzing}
              className="px-4 py-2 bg-[#2D2A26] text-white rounded-lg text-sm font-medium hover:bg-[#3D3A36] disabled:opacity-50 flex items-center gap-2"
            >
              {isAnalyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Reading your brand voice...</> : "Re-read from document"}
            </button>
            {analysisDone && (
              <span className="flex items-center gap-1.5 text-sm text-[#1F7A4F] font-medium">
                <Check className="w-4 h-4" /> Your brand voice is updated. Take a look below
              </span>
            )}
          </div>
        )}
      </div>

      {/* Sending & sender */}
      <div className="mb-8 p-6 bg-[#FAF9F7] rounded-xl border border-[#E8E4DE]">
        <h3 className="text-lg font-semibold text-[#2D2A26] mb-2">Sending &amp; sender</h3>
        <p className="text-sm text-[#8B8074] mb-4">
          How often should joon reach out, and who do emails come from? You can change these anytime.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[#8B8074] mb-1 block">Sending frequency</label>
            <select value={sendFreq} onChange={(e) => setSendFreq(e.target.value)} className="w-full px-3 py-2 border border-[#E8E4DE] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8B8074]/30">
              <option value="minimal">Minimal — only the important moments</option>
              <option value="balanced">Balanced — a steady, considered cadence</option>
              <option value="frequent">Frequent — stay top of mind</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[#8B8074] mb-1 block">From name</label>
            <input type="text" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="e.g. Vana Naturals" className="w-full px-3 py-2 border border-[#E8E4DE] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8B8074]/30" />
          </div>
          <div>
            <label className="text-xs text-[#8B8074] mb-1 block">From email</label>
            <input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="hello@yourbrand.com" className="w-full px-3 py-2 border border-[#E8E4DE] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8B8074]/30" />
          </div>
          <div>
            <label className="text-xs text-[#8B8074] mb-1 block">Reply-to email</label>
            <input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="care@yourbrand.com" className="w-full px-3 py-2 border border-[#E8E4DE] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8B8074]/30" />
          </div>
        </div>
      </div>

      {/* What Joon Found */}
      {bp && (
        <div className="glass-card-static rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-[#1F7A4F]" />
            <span className="text-xs font-medium uppercase tracking-wide text-[#1F7A4F]">What joon found</span>
          </div>
          <p className="text-sm text-[#2C2C2C] font-medium mb-1">
            {bp.brandName || "Your Store"}
          </p>
          {bp.brandDescription && (
            <p className="text-xs text-[#5C5549] mb-3">{bp.brandDescription}</p>
          )}
          {bp.sampleCopy && (bp.sampleCopy as string[]).length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-[#8B8074]">Sample copy from your store</span>
              {(bp.sampleCopy as string[]).slice(0, 3).map((copy: string, i: number) => (
                <div key={i} className="flex gap-2 text-xs text-[#5C5549] bg-white/40 rounded-lg px-3 py-2">
                  <Quote className="w-3 h-3 text-[#8B8074] shrink-0 mt-0.5" />
                  <span className="italic">{copy.length > 120 ? copy.slice(0, 120) + "..." : copy}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Brand Voice — Tone */}
      <div className="glass-card-static rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="w-4 h-4 text-[#8B8074]" />
          <span className="text-xs font-medium uppercase tracking-wide text-[#8B8074]">Brand Voice</span>
        </div>
        <p className="text-sm text-[#5C5549] mb-4">{toneSummary}</p>

        <div className="space-y-4">
          {TONE_DIMENSIONS.map((dim) => {
            const toneVal = tone[dim.key] ?? dim.options[1] ?? "";
            const currentIdx = (dim.options as readonly string[]).indexOf(toneVal);
            return (
              <div key={dim.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-[#2C2C2C]">{dim.label}</span>
                  <span className="text-[10px] text-[#1F7A4F] font-medium">
                    {dim.options[currentIdx >= 0 ? currentIdx : 1] ?? ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#8B8074] w-16 text-right shrink-0">{dim.left.label}</span>
                  <input
                    type="range"
                    min={0}
                    max={dim.options.length - 1}
                    value={currentIdx >= 0 ? currentIdx : 1}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      const val = dim.options[idx];
                      if (val != null) setTone((prev) => ({ ...prev, [dim.key]: val }));
                    }}
                    className="flex-1 h-1.5 accent-[#1F7A4F] cursor-pointer"
                  />
                  <span className="text-[10px] text-[#8B8074] w-16 shrink-0">{dim.right.label}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-[#A09888] italic max-w-[45%]">&ldquo;{dim.left.example}&rdquo;</span>
                  <span className="text-[10px] text-[#A09888] italic max-w-[45%] text-right">&ldquo;{dim.right.example}&rdquo;</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live preview */}
        <div className="mt-5 p-4 bg-white/60 rounded-lg border border-[#EDE7DB]">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[#8B8074] block mb-2">Live Preview</span>
          <p className="text-xs font-medium text-[#2C2C2C]">Subject: {sampleCopy.subject}</p>
          <p className="text-xs text-[#5C5549] mt-1">{sampleCopy.body}</p>
          <span className="inline-block mt-2 px-3 py-1 text-[10px] font-medium bg-[#1F7A4F] text-white rounded">{sampleCopy.cta}</span>
        </div>
      </div>

      {/* Vocabulary */}
      <div className="glass-card-static rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Ban className="w-4 h-4 text-[#8B8074]" />
          <span className="text-xs font-medium uppercase tracking-wide text-[#8B8074]">Vocabulary</span>
        </div>
        {bp?.vocabulary && (
          <div className="mb-3">
            <span className="text-[10px] font-medium uppercase tracking-wide text-[#8B8074] block mb-1">Detected brand terms</span>
            <div className="flex flex-wrap gap-1">
              {[...((bp.vocabulary as any).preferredWords ?? []), ...((bp.vocabulary as any).brandTerms ?? [])].slice(0, 15).map((word: string, i: number) => (
                <span key={i} className="px-2 py-0.5 text-[10px] bg-[#1F7A4F]/10 text-[#1F7A4F] rounded-full">{word}</span>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="text-xs text-[#5C5549] block mb-1">Words to avoid (comma-separated)</label>
          <input type="text" value={bannedWords} onChange={(e) => setBannedWords(e.target.value)} className="w-full px-3 py-2 text-xs rounded-lg border border-[#EDE7DB] bg-white/60 text-[#2C2C2C]" placeholder="cheap, discount, spam..." />
        </div>
      </div>

      {/* Aesthetic */}
      <div className="glass-card-static rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-4 h-4 text-[#8B8074]" />
          <span className="text-xs font-medium uppercase tracking-wide text-[#8B8074]">Visual Aesthetic</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {AESTHETIC_OPTIONS.map((opt) => {
            const isSelected = aesthetic === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setAesthetic(opt.value)}
                className={`relative text-left p-3 rounded-xl transition-all ${
                  isSelected
                    ? "border-2 border-[#1F7A4F] bg-[#1F7A4F]/5"
                    : "border border-[#EDE7DB] hover:bg-white/40"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#1F7A4F] flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                <span className="text-xs font-medium text-[#2C2C2C] block pr-6">{opt.label}</span>
                <span className="text-[10px] text-[#8B8074] block mt-0.5">{opt.desc}</span>
                <span className="text-[10px] text-[#1F7A4F] block mt-1">Best for: {opt.bestFor}</span>
                <div className="mt-2 pt-2 border-t border-[#EDE7DB]/50 space-y-0.5">
                  <p className="text-[10px] text-[#5C5549]"><span className="font-medium">Subject:</span> {opt.exampleSubject}</p>
                  <p className="text-[10px] text-[#5C5549]"><span className="font-medium">CTA:</span> {opt.exampleCTA}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Colors */}
      <div className="glass-card-static rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-4 h-4 text-[#8B8074]" />
          <span className="text-xs font-medium uppercase tracking-wide text-[#8B8074]">Brand Colors</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {COLOR_TOKENS.map(({ key, label }) => (
            <div key={key}>
              <label className="text-xs text-[#5C5549] mb-1 block">{label}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={tokens[key] || "#000000"} onChange={(e) => updateToken(key, e.target.value)} className="w-8 h-8 rounded border border-[#EDE7DB] cursor-pointer" />
                <input type="text" value={tokens[key] || ""} onChange={(e) => updateToken(key, e.target.value)} className="flex-1 px-2 py-1 text-xs font-mono rounded border border-[#EDE7DB] bg-white/60 text-[#2C2C2C]" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Typography */}
      <div className="glass-card-static rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Type className="w-4 h-4 text-[#8B8074]" />
          <span className="text-xs font-medium uppercase tracking-wide text-[#8B8074]">Typography</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[{ key: "headingFont", label: "Heading Font" }, { key: "bodyFont", label: "Body Font" }].map(({ key, label }) => (
            <div key={key}>
              <label className="text-xs text-[#5C5549] mb-1 block">{label}</label>
              <input type="text" value={tokens[key] || ""} onChange={(e) => updateToken(key, e.target.value)} className="w-full px-3 py-1.5 text-xs rounded border border-[#EDE7DB] bg-white/60 text-[#2C2C2C]" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        {onBack ? (
          <button onClick={onBack} className="text-sm text-[#8B8074] hover:text-[#5C5549] transition-colors">← Back</button>
        ) : <div />}
        <button onClick={handleSave} disabled={onSave.isPending} className="flex items-center gap-2 px-5 py-2.5 bg-[#1F7A4F] text-white text-sm rounded-lg hover:bg-[#175E3D] transition-colors disabled:opacity-40">
          {onSave.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save & Continue
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Autonomy Configuration
// ---------------------------------------------------------------------------

function AutonomyStep({ storeId, onSave, onBack }: { storeId: string; onSave: { mutate: (input: any) => void; isPending: boolean }; onBack?: () => void }) {
  const [tiers, setTiers] = useState<Record<string, string>>({
    cart_recovery: "autopilot",
    win_back: "copilot",
    post_purchase: "autopilot",
    vip: "copilot",
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#2C2C2C] mb-1">How much should joon do on its own?</h2>
        <p className="text-sm text-[#8B8074]">Set this for each kind of action. You can change it anytime.</p>
      </div>
      <div className="space-y-3">
        {AUTONOMY_CATEGORIES.map(({ key, label, desc }) => (
          <div key={key} className="glass-card-static rounded-xl p-4">
            <div className="mb-3">
              <span className="text-sm font-medium text-[#2C2C2C]">{label}</span>
              <p className="text-xs text-[#8B8074]">{desc}</p>
            </div>
            <div className="flex gap-2">
              {TIER_OPTIONS.map((tier) => (
                <button key={tier.value} onClick={() => setTiers((prev) => ({ ...prev, [key]: tier.value }))} className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${tiers[key] === tier.value ? "border-[#1F7A4F] bg-[#1F7A4F]/10 text-[#1F7A4F] font-medium" : "border-[#EDE7DB] text-[#5C5549] hover:bg-[#EDE7DB]/40"}`}>
                  <div className="font-medium">{tier.label}</div>
                  <div className="text-[10px] mt-0.5 opacity-70">{tier.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        {onBack ? (
          <button onClick={onBack} className="text-sm text-[#8B8074] hover:text-[#5C5549] transition-colors">← Back</button>
        ) : <div />}
        <button onClick={() => onSave.mutate({ storeId, configs: Object.entries(tiers).map(([category, tier]) => ({ category, tier })) })} disabled={onSave.isPending} className="flex items-center gap-2 px-5 py-2.5 bg-[#1F7A4F] text-white text-sm rounded-lg hover:bg-[#175E3D] transition-colors disabled:opacity-40">
          {onSave.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          Save & Continue
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: Guardrails
// ---------------------------------------------------------------------------

function GuardrailsStep({ storeId, onSave, onBack }: { storeId: string; onSave: { mutate: (input: any) => void; isPending: boolean }; onBack?: () => void }) {
  const [maxEmails, setMaxEmails] = useState(3);
  const [maxDiscount, setMaxDiscount] = useState(20);
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(7);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#2C2C2C] mb-1">Set joon&apos;s limits</h2>
        <p className="text-sm text-[#8B8074]">These are the boundaries joon always stays within. You can change them anytime.</p>
      </div>
      <div className="glass-card-static rounded-xl p-5 space-y-5">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-[#2C2C2C] mb-2"><Shield className="w-4 h-4 text-[#8B8074]" /> Max emails per customer per week</label>
          <input type="number" value={maxEmails} onChange={(e) => setMaxEmails(Number(e.target.value))} min={1} max={10} className="w-24 px-3 py-2 text-sm rounded-lg border border-[#EDE7DB] bg-white/60 text-[#2C2C2C]" />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-[#2C2C2C] mb-2"><ShieldCheck className="w-4 h-4 text-[#8B8074]" /> Max discount percentage</label>
          <div className="flex items-center gap-2">
            <input type="number" value={maxDiscount} onChange={(e) => setMaxDiscount(Number(e.target.value))} min={5} max={50} className="w-24 px-3 py-2 text-sm rounded-lg border border-[#EDE7DB] bg-white/60 text-[#2C2C2C]" />
            <span className="text-sm text-[#8B8074]">%</span>
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-[#2C2C2C] mb-2"><Sparkles className="w-4 h-4 text-[#8B8074]" /> Quiet hours (no messages)</label>
          <div className="flex items-center gap-2 text-sm">
            <input type="number" value={quietStart} onChange={(e) => setQuietStart(Number(e.target.value))} min={0} max={23} className="w-20 px-3 py-2 rounded-lg border border-[#EDE7DB] bg-white/60 text-[#2C2C2C]" />
            <span className="text-[#8B8074]">:00 to</span>
            <input type="number" value={quietEnd} onChange={(e) => setQuietEnd(Number(e.target.value))} min={0} max={23} className="w-20 px-3 py-2 rounded-lg border border-[#EDE7DB] bg-white/60 text-[#2C2C2C]" />
            <span className="text-[#8B8074]">:00</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="text-sm text-[#8B8074] hover:text-[#5C5549] transition-colors">← Back</button>
          )}
          <button onClick={() => onSave.mutate({ storeId, skip: true })} disabled={onSave.isPending} className="text-sm text-[#8B8074] hover:text-[#5C5549] transition-colors">Skip for now</button>
        </div>
        <button onClick={() => onSave.mutate({ storeId, maxEmailsPerWeek: maxEmails, maxDiscountPercent: maxDiscount, quietHoursStart: quietStart, quietHoursEnd: quietEnd })} disabled={onSave.isPending} className="flex items-center gap-2 px-5 py-2.5 bg-[#1F7A4F] text-white text-sm rounded-lg hover:bg-[#175E3D] transition-colors disabled:opacity-40">
          {onSave.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          Save & Continue
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 6: Store Intelligence Report
// ---------------------------------------------------------------------------

function StoreReportStep({ storeId, onAcknowledge, isAdvancing, onBack }: { storeId: string; onAcknowledge: () => void; isAdvancing: boolean; onBack?: () => void }) {
  const { data: report, isLoading } = trpc.briefings.storeReport.useQuery({ storeId }, { enabled: !!storeId });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#8B8074]" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#2C2C2C] mb-1">What joon learned about your store</h2>
        <p className="text-sm text-[#8B8074]">Here&apos;s a first look at what joon found.</p>
      </div>
      {report && (
        <div className="space-y-4">
          <div className="glass-card-static rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-[#8B8074]" /><span className="text-xs font-medium uppercase tracking-wide text-[#8B8074]">Customer Insights</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Total Customers" value={report.customerInsights.totalCustomers} />
              <Stat label="VIP Customers" value={report.customerInsights.vipCount} />
              <Stat label="At Risk" value={report.customerInsights.churnRiskCount} />
              <Stat label="Top Segment" value={report.customerInsights.topSegment ?? "N/A"} />
            </div>
          </div>
          <div className="glass-card-static rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3"><BarChart3 className="w-4 h-4 text-[#8B8074]" /><span className="text-xs font-medium uppercase tracking-wide text-[#8B8074]">Revenue Insights</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Stat label="Total Revenue" value={`₹${(report.revenueInsights.totalRevenue / 100).toLocaleString("en-IN")}`} />
              <Stat label="Avg Order Value" value={`₹${(report.revenueInsights.avgOrderValue / 100).toFixed(2)}`} />
              <Stat label="Repeat Purchase Rate" value={`${(report.revenueInsights.repeatPurchaseRate * 100).toFixed(1)}%`} />
            </div>
          </div>
          {report.recommendations.length > 0 && (
            <div className="glass-card-static rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3"><FileText className="w-4 h-4 text-[#8B8074]" /><span className="text-xs font-medium uppercase tracking-wide text-[#8B8074]">Recommendations</span></div>
              <ul className="space-y-2">
                {report.recommendations.map((rec: string, i: number) => (
                  <li key={i} className="flex gap-2 text-sm text-[#5C5549]"><Sparkles className="w-4 h-4 text-[#1F7A4F] shrink-0 mt-0.5" />{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="flex justify-between">
        {onBack ? (
          <button onClick={onBack} className="text-sm text-[#8B8074] hover:text-[#5C5549] transition-colors">← Back</button>
        ) : <div />}
        <button onClick={onAcknowledge} disabled={isAdvancing} className="flex items-center gap-2 px-5 py-2.5 bg-[#2C2C2C] text-white text-sm rounded-lg hover:bg-[#1a1a1a] transition-colors disabled:opacity-40">
          {isAdvancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          Got it. Show me what joon can do
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-[#8B8074]">{label}</div>
      <div className="text-lg font-semibold text-[#2C2C2C]">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 7: First Actions
// ---------------------------------------------------------------------------

function FirstActionsStep({ onComplete, isCompleting, onBack }: { storeId: string; onComplete: () => void; isCompleting: boolean; onBack?: () => void }) {
  return (
    <div className="space-y-6">
      <div className="text-center py-6">
        <div className="w-16 h-16 rounded-2xl bg-[#1F7A4F]/10 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-8 h-8 text-[#1F7A4F]" />
        </div>
        <h2 className="text-xl font-semibold text-[#2C2C2C] mb-2">You&apos;re all set</h2>
        <p className="text-sm text-[#8B8074] max-w-md mx-auto leading-relaxed">
          When you continue, joon gets to work: setting up your automations, looking for campaign
          opportunities, and writing your first briefing. You can watch it all happen live in the joon panel.
        </p>
      </div>

      <div className="glass-card-static rounded-xl p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-[#8B8074] mb-3">What happens next</div>
        <div className="space-y-3">
          {[
            { icon: Zap, text: "joon sets up automations to match the autonomy you chose" },
            { icon: Sparkles, text: "joon spots campaign opportunities in your customer data" },
            { icon: Boxes, text: "joon writes your first briefing, full of insights" },
          ].map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[#1F7A4F]/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-[#1F7A4F]" />
              </div>
              <span className="text-sm text-[#5C5549]">{text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        {onBack ? (
          <button onClick={onBack} className="text-sm text-[#8B8074] hover:text-[#5C5549] transition-colors">← Back</button>
        ) : <div />}
        <button onClick={onComplete} disabled={isCompleting} className="flex items-center gap-2 px-6 py-2.5 bg-[#1F7A4F] text-white text-sm rounded-lg hover:bg-[#175E3D] transition-colors disabled:opacity-40">
          {isCompleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          Launch joon
        </button>
      </div>
    </div>
  );
}
