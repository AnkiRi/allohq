"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  UserMinus,
  Rocket,
  Zap,
  Heart,
  Newspaper,
  Wand2,
  Monitor,
  Smartphone,
  X,
  Loader2,
  ChevronRight,
  Check,
  Send,
  Settings2,
  Save,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { EmailCanvas } from "@/components/email-builder/EmailCanvas";
import { createDefaultBlock } from "@allohq/email-builder";
import type { EmailBlock, EmailBlockType } from "@allohq/email-builder";
import { cn } from "@allohq/ui";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type GoalId = "win_back" | "product_launch" | "flash_sale" | "post_purchase" | "newsletter" | "custom";

interface GoalOption {
  id: GoalId;
  label: string;
  description: string;
  icon: LucideIcon;
}

const GOALS: GoalOption[] = [
  { id: "win_back", label: "Win-back", description: "Re-engage customers who haven't purchased recently", icon: UserMinus },
  { id: "product_launch", label: "Product Launch", description: "Announce a new product to your audience", icon: Rocket },
  { id: "flash_sale", label: "Flash Sale", description: "Create urgency with a time-limited offer", icon: Zap },
  { id: "post_purchase", label: "Post-Purchase", description: "Delight customers after they buy", icon: Heart },
  { id: "newsletter", label: "Newsletter", description: "Share updates, stories, and recommendations", icon: Newspaper },
  { id: "custom", label: "Custom", description: "Describe what you need and AI will create it", icon: Wand2 },
];

const SUBJECT_LINES: Record<GoalId, string> = {
  win_back: "{{first_name}}, we saved something special for you",
  product_launch: "Introducing: Something new just dropped",
  flash_sale: "\u26A1 24 hours only \u2014 up to 50% off",
  post_purchase: "Your order is confirmed! Here's what's next",
  newsletter: "This week at {{store_name}}: New arrivals & more",
  custom: "Check this out, {{first_name}}",
};

const TONE_OPTIONS = ["Professional", "Casual", "Urgent", "Friendly", "Playful"] as const;

const BLOCK_TYPE_LABELS: Partial<Record<EmailBlockType, string>> = {
  text: "Text",
  image: "Image",
  button: "Button",
  divider: "Divider",
  spacer: "Spacer",
  product: "Product",
  product_grid: "Product Grid",
  columns: "Columns",
  social: "Social",
  header: "Header",
  footer: "Footer",
  hero: "Hero",
  icon_row: "Icon Row",
  countdown: "Countdown",
  testimonial: "Testimonial",
};

const BLOCK_TYPE_ICONS: Partial<Record<EmailBlockType, string>> = {
  text: "\uD83D\uDCDD",
  image: "\uD83D\uDDBC\uFE0F",
  button: "\uD83D\uDD18",
  divider: "\u2014",
  spacer: "\u2195\uFE0F",
  product: "\uD83D\uDCE6",
  product_grid: "\uD83D\uDED2",
  columns: "\u2593",
  social: "\uD83D\uDD17",
  header: "\uD83C\uDFE0",
  footer: "\uD83D\uDC63",
  hero: "\u2B50",
  icon_row: "\uD83C\uDF1F",
  countdown: "\u23F0",
  testimonial: "\uD83D\uDCAC",
};

// Step labels
const STEP_LABELS = ["Goal", "Generate", "Preview & Refine", "Ship It"];

// ---------------------------------------------------------------------------
// Block generation per goal
// ---------------------------------------------------------------------------

function uid(): string {
  return `blk-${crypto.randomUUID().slice(0, 8)}`;
}

function makeBlock(type: EmailBlockType, overrides?: Record<string, unknown>): EmailBlock {
  const block = createDefaultBlock(type, uid());
  if (overrides) {
    (block as any).props = { ...(block as any).props, ...overrides };
  }
  return block;
}

function generateBlocksForGoal(goal: GoalId): EmailBlock[] {
  switch (goal) {
    case "win_back":
      return [
        makeBlock("hero", { heading: "We miss you, {{first_name}}!", subtext: "It's been a while since your last visit. We've got something special waiting for you.", bgColor: "#2c2418", textColor: "#FFFFFF", buttonText: "Come Back & Save 15%", buttonHref: "#" }),
        makeBlock("text", { html: "<p>Hey {{first_name}},</p><p>We noticed you haven't visited in a while, and we wanted to reach out. We've been busy adding new products and improvements that we think you'll love.</p><p>As a token of appreciation for being part of our community, here's an exclusive 15% discount just for you.</p>" }),
        makeBlock("product_grid", { productIds: [], columns: 3, showPrice: true, source: "recommended" as any, dynamicProductCount: 3 }),
        makeBlock("button", { text: "Come Back & Save 15%", href: "#", bgColor: "#C4704D", textColor: "#FFFFFF", borderRadius: 8, align: "center" }),
        makeBlock("testimonial", { quote: "I keep coming back because of the quality and customer service. Truly the best!", author: "Sarah M.", rating: 5 }),
        makeBlock("footer", { text: "You received this email because you are a valued customer.", unsubscribeText: "Unsubscribe" }),
      ];

    case "product_launch":
      return [
        makeBlock("header", { bgColor: "#FFFFFF" }),
        makeBlock("hero", { heading: "Introducing Something New", subtext: "The wait is over. Discover our latest product, crafted with care.", bgColor: "#1a1815", textColor: "#FFFFFF", buttonText: "Shop Now", buttonHref: "#" }),
        makeBlock("text", { html: "<p>We're thrilled to introduce our newest addition. Months of development and refinement have gone into creating something truly special.</p><p>Here's what makes it stand out:</p>" }),
        makeBlock("icon_row", { items: [{ icon: "\u2728", label: "Premium Quality" }, { icon: "\uD83C\uDF3F", label: "Sustainably Made" }, { icon: "\uD83D\uDE80", label: "Ships Tomorrow" }] }),
        makeBlock("button", { text: "Shop Now", href: "#", bgColor: "#C4704D", textColor: "#FFFFFF", borderRadius: 8, align: "center" }),
        makeBlock("footer", { text: "You received this email because you subscribed to our list.", unsubscribeText: "Unsubscribe" }),
      ];

    case "flash_sale":
      return [
        makeBlock("hero", { heading: "\uD83D\uDD25 24-Hour Flash Sale", subtext: "Up to 50% off our best sellers. Don't miss out!", bgColor: "#C4704D", textColor: "#FFFFFF", buttonText: "Shop the Sale", buttonHref: "#" }),
        makeBlock("countdown", { endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), label: "Sale ends in", bgColor: "#2c2418", textColor: "#FFFFFF" }),
        makeBlock("product_grid", { productIds: [], columns: 3, showPrice: true, source: "trending" as any, dynamicProductCount: 6 }),
        makeBlock("button", { text: "Shop the Sale", href: "#", bgColor: "#C4704D", textColor: "#FFFFFF", borderRadius: 8, align: "center", fullWidth: true }),
        makeBlock("footer", { text: "This offer expires in 24 hours. Don't wait!", unsubscribeText: "Unsubscribe" }),
      ];

    case "post_purchase":
      return [
        makeBlock("header", { bgColor: "#FFFFFF" }),
        makeBlock("text", { html: "<h2 style='margin:0'>Thank you for your order! \uD83C\uDF89</h2><p>We're preparing your items with care. Here's what happens next:</p>" }),
        makeBlock("icon_row", { items: [{ icon: "\uD83D\uDCE6", label: "Packing", description: "Your order is being prepared" }, { icon: "\uD83D\uDE9A", label: "Shipping", description: "On its way within 2 days" }, { icon: "\u21A9\uFE0F", label: "Easy Returns", description: "30-day hassle-free returns" }] }),
        makeBlock("product_grid", { productIds: [], columns: 2, showPrice: true, source: "cross_sell" as any, dynamicProductCount: 4 }),
        makeBlock("button", { text: "Track Your Order", href: "#", bgColor: "#2c2418", textColor: "#FFFFFF", borderRadius: 8, align: "center" }),
        makeBlock("footer", { text: "Thank you for choosing us! Questions? Reply to this email.", unsubscribeText: "Unsubscribe" }),
      ];

    case "newsletter":
      return [
        makeBlock("header", { bgColor: "#FFFFFF" }),
        makeBlock("text", { html: "<h2 style='margin:0'>This Week's Highlights</h2><p>Happy {{day_of_week}}, {{first_name}}! Here's what's new this week.</p>" }),
        makeBlock("divider"),
        makeBlock("text", { html: "<h3>\uD83C\uDF1F What's New</h3><p>We've been hard at work bringing you fresh products and exciting updates. Here's a peek at what just landed.</p>" }),
        makeBlock("text", { html: "<h3>\uD83D\uDCA1 Tips & Inspiration</h3><p>Looking for ideas? Check out our latest style guide for the season ahead.</p>" }),
        makeBlock("product_grid", { productIds: [], columns: 3, showPrice: true, source: "trending" as any, dynamicProductCount: 3 }),
        makeBlock("social", { links: [{ platform: "instagram", url: "#" }, { platform: "twitter", url: "#" }, { platform: "facebook", url: "#" }] }),
        makeBlock("footer", { text: "You're receiving this because you subscribed to our newsletter.", unsubscribeText: "Unsubscribe" }),
      ];

    case "custom":
    default:
      return [
        makeBlock("header", { bgColor: "#FFFFFF" }),
        makeBlock("hero", { heading: "Your Heading Here", subtext: "Add a compelling message for your audience", bgColor: "#1a1815", textColor: "#FFFFFF", buttonText: "Take Action", buttonHref: "#" }),
        makeBlock("text", { html: "<p>Write your message here. Tell your audience what matters and why they should care.</p>" }),
        makeBlock("button", { text: "Call to Action", href: "#", bgColor: "#C4704D", textColor: "#FFFFFF", borderRadius: 8, align: "center" }),
        makeBlock("footer", { text: "You received this email because you subscribed.", unsubscribeText: "Unsubscribe" }),
      ];
  }
}

// ---------------------------------------------------------------------------
// Subject line scoring (client-side heuristic matching the creative-engine)
// ---------------------------------------------------------------------------

const POWER_WORDS = new Set([
  "now", "today", "hurry", "limited", "last", "ending", "expires", "deadline", "final",
  "rush", "instant", "immediately", "fast", "quick", "exclusive", "vip", "members",
  "invite", "only", "secret", "private", "selected", "free", "save", "deal", "offer",
  "discount", "bonus", "reward", "gift", "bargain", "value", "steal", "discover",
  "reveal", "surprising", "unexpected", "mystery", "unlock", "hidden", "popular",
  "trending", "bestselling", "favorite", "loved", "top", "love", "amazing",
  "incredible", "gorgeous", "stunning", "beautiful", "perfect", "essential",
  "get", "grab", "claim", "snag", "shop", "try", "explore", "start",
]);

const SPAM_WORDS = new Set([
  "buy", "order", "purchase", "click", "subscribe", "earn", "winner",
  "congratulations", "urgent", "act now", "limited time", "don't miss",
  "100%", "guarantee", "no obligation", "risk free", "cash",
]);

function scoreSubjectLocally(subject: string): { score: number; label: string; color: string } {
  const trimmed = subject.trim();
  if (!trimmed) return { score: 0, label: "Empty", color: "text-red-500" };

  const lower = trimmed.toLowerCase();
  const words = lower.split(/\s+/);
  let score = 30; // base

  // Length
  const len = trimmed.length;
  if (len >= 30 && len <= 50) score += 20;
  else if (len >= 20 && len < 30) score += 14;
  else if (len > 50 && len <= 60) score += 15;
  else if (len > 60) score += 5;
  else score += 8;

  // Personalization
  if (lower.includes("{{first_name}}") || lower.includes("{{name}}")) score += 15;

  // Power words
  const pwCount = words.filter((w) => POWER_WORDS.has(w)).length;
  if (pwCount >= 2) score += 15;
  else if (pwCount === 1) score += 8;

  // Spam words penalty
  const spamCount = words.filter((w) => SPAM_WORDS.has(w)).length;
  score -= spamCount * 5;

  // Emoji bonus
  const emojiCount = (trimmed.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
  if (emojiCount === 1) score += 5;

  score = Math.max(0, Math.min(100, score));

  let label: string;
  let color: string;
  if (score >= 75) { label = "Great"; color = "text-green-600 dark:text-green-400"; }
  else if (score >= 50) { label = "Good"; color = "text-amber-600 dark:text-amber-400"; }
  else { label = "Needs Work"; color = "text-red-500 dark:text-red-400"; }

  return { score, label, color };
}

// Subject line alternative generator
function generateSubjectAlternatives(subject: string, goal: GoalId): string[] {
  const base = subject.replace(/{{.*?}}/g, "").trim();

  const templates: Record<GoalId, string[]> = {
    win_back: [
      "{{first_name}}, it's been too long \u2014 here's 15% off",
      "We've missed you! Come see what's new",
      "Your favorites are waiting, {{first_name}}",
      "A special offer, just for you \u2764\uFE0F",
      "{{first_name}}, your 15% discount expires soon",
    ],
    product_launch: [
      "Just dropped: You're going to love this",
      "First look: Our newest arrival is here",
      "Be the first to shop our latest release",
      "New arrival alert \u2728 See what's inside",
      "The one you've been waiting for is here",
    ],
    flash_sale: [
      "\u26A1 Don't miss out: 50% off ends tonight",
      "24 hours. Up to 50% off. Go!",
      "This sale won't last \u2014 shop now or miss out",
      "FLASH: Half off your favorites, today only",
      "\uD83D\uDD25 Biggest sale of the season \u2014 24 hours only",
    ],
    post_purchase: [
      "Thanks for your order! Here's what's next",
      "Your order is on its way \uD83D\uDCE6",
      "Order confirmed \u2014 plus picks you'll love",
      "We're packing your order with care \u2764\uFE0F",
      "Great choice! Your order details inside",
    ],
    newsletter: [
      "Your weekly dose of inspiration is here",
      "New this week: Arrivals, tips & more",
      "{{first_name}}, here's what you missed this week",
      "Fresh finds + insider tips inside \uD83D\uDC40",
      "This week's top picks, curated for you",
    ],
    custom: [
      "Something special, just for you",
      "{{first_name}}, you'll want to see this",
      "Don't miss this \u2014 open for a surprise",
      "We thought you'd love this, {{first_name}}",
      base ? `Re: ${base.slice(0, 40)}` : "A quick update from us",
    ],
  };

  return templates[goal] || templates.custom;
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function NewTemplatePage() {
  const router = useRouter();
  const { toast } = useToast();

  // Wizard state
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<GoalId | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [subject, setSubject] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [tone, setTone] = useState<string>("Professional");
  const [aiInstruction, setAiInstruction] = useState("");
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);

  // tRPC
  const createMut = trpc.templates.create.useMutation();
  const renderMut = trpc.templates.renderPreview.useMutation();

  // Store for potential AI regen
  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";

  // AI regenerate (use if available)
  const regenerateMut = (trpc.ai as any).regenerateEmail?.useMutation?.({
    onError: (err: { message?: string }) => toast(err.message || "That rewrite didn't go through. Mind trying again?", "error"),
  }) as { mutateAsync?: (input: any) => Promise<any>; isPending?: boolean } | undefined;

  // Subject scoring
  const subjectScore = useMemo(() => scoreSubjectLocally(subject), [subject]);

  // Subject alternatives
  const subjectAlternatives = useMemo(
    () => (goal ? generateSubjectAlternatives(subject, goal) : []),
    [subject, goal]
  );

  // -- Step 2: Auto-generate on entry --
  useEffect(() => {
    if (step === 2 && goal) {
      // Simulate generation delay for UX
      const timeout = setTimeout(() => {
        const generatedBlocks = generateBlocksForGoal(goal);
        const generatedSubject = SUBJECT_LINES[goal];
        const goalLabel = GOALS.find((g) => g.id === goal)?.label ?? "Custom";
        setBlocks(generatedBlocks);
        setSubject(generatedSubject);
        setTemplateName(`${goalLabel} Email`);
        setStep(3);
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [step, goal]);

  // -- Render preview when blocks change on step 3 --
  useEffect(() => {
    if (step === 3 && blocks.length > 0 && !showAdvancedEditor) {
      renderMut.mutate({ blocks: blocks as any });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, blocks, showAdvancedEditor]);

  // Preview HTML from render mutation — used as srcdoc on the iframe
  const previewHtml = renderMut.data?.html ?? "";

  // -- Handlers --

  function handleGoalNext() {
    if (!goal) return;
    setStep(2);
  }

  function handleDeleteBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  async function handleSaveTemplate() {
    try {
      const template = await createMut.mutateAsync({
        name: templateName || "Untitled Template",
        subject: subject || templateName || "Untitled",
        blocks: blocks as any,
        category: "ai_generated",
      });
      toast("Your template is saved.", "success");
      router.push(`/templates/${template.id}/edit`);
    } catch {
      toast("We couldn't save that. Mind trying again?", "error");
    }
  }

  async function handleLaunchCampaign() {
    try {
      const template = await createMut.mutateAsync({
        name: templateName || "Untitled Template",
        subject: subject || templateName || "Untitled",
        blocks: blocks as any,
        category: "ai_generated",
      });
      toast("Saved \u2014 let's set up your campaign.", "success");
      router.push(`/campaigns/new?templateId=${template.id}`);
    } catch {
      toast("We couldn't save that. Mind trying again?", "error");
    }
  }

  function handleUseInAutomation() {
    toast("Coming soon \u2014 you'll be able to drop this into an automation.", "info");
  }

  async function handleRegenerate() {
    if (!storeId || !regenerateMut?.mutateAsync) {
      toast("Rewriting with allo is coming soon.", "info");
      return;
    }
    try {
      const result = await regenerateMut.mutateAsync({
        storeId,
        blocks,
        feedback: aiInstruction || undefined,
        toneOverride: tone.toLowerCase(),
      });
      if (result?.blocks) {
        setBlocks(result.blocks);
        if (result.subject) setSubject(result.subject);
        toast("Here's a fresh take.", "success");
        setAiInstruction("");
      }
    } catch {
      // handled by mutation onError
    }
  }

  function handleCanvasSave(savedBlocks: EmailBlock[]) {
    setBlocks(savedBlocks);
    setShowAdvancedEditor(false);
    toast("Your changes are in.", "success");
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/templates" className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <h1 className="text-[18px] tracking-[-0.5px] font-semibold text-foreground font-serif">
          Create an email
        </h1>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1;
          const isActive = step === stepNum;
          const isCompleted = step > stepNum;
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && (
                <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
              )}
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold transition-all",
                    isActive
                      ? "bg-[var(--color-accent)] text-white"
                      : isCompleted
                        ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? <Check className="w-3 h-3" /> : stepNum}
                </div>
                <span
                  className={cn(
                    "text-[11px] font-sans transition-colors hidden sm:inline",
                    isActive ? "text-foreground font-bold" : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        {/* ================================================================ */}
        {/* STEP 1: Goal Selection                                           */}
        {/* ================================================================ */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div>
              <h2 className="text-[10px] uppercase tracking-[1px] font-sans text-muted-foreground mb-1">
                STEP 1
              </h2>
              <p className="text-[15px] text-foreground font-bold">
                What's the goal of this email?
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {GOALS.map((g) => {
                const Icon = g.icon;
                const isSelected = goal === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => setGoal(g.id)}
                    className={cn(
                      "text-left p-5 rounded-xl transition-all",
                      "bg-card dark:bg-[rgba(40,36,30,0.7)]",
                      "border border-border dark:border-[rgba(200,180,150,0.12)]",
                      "hover:shadow-md hover:-translate-y-0.5",
                      isSelected && "ring-2 ring-[var(--color-accent)]"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                          isSelected
                            ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-foreground">
                          {g.label}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          {g.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom prompt input */}
            <AnimatePresence>
              {goal === "custom" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="mt-2">
                    <label className="text-[10px] uppercase tracking-[1px] font-sans text-muted-foreground block mb-1.5">
                      DESCRIBE YOUR EMAIL
                    </label>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      rows={3}
                      placeholder="E.g., 'A holiday sale email with a festive theme, featuring our top 6 products with a 20% off coupon code...'"
                      className="w-full px-4 py-3 bg-card dark:bg-[rgba(40,36,30,0.7)] border border-border dark:border-[rgba(200,180,150,0.12)] rounded-xl text-[13px] font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Next button */}
            <div className="flex justify-end">
              <button
                onClick={handleGoalNext}
                disabled={!goal}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-lg text-[13px] font-sans font-bold transition-all",
                  goal
                    ? "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ================================================================ */}
        {/* STEP 2: AI Generation (auto-triggers)                            */}
        {/* ================================================================ */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center py-20 space-y-6"
          >
            {/* Pulsing gradient animation */}
            <div className="relative w-24 h-24">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-success)] opacity-20 animate-ping" />
              <div className="absolute inset-2 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-success)] opacity-30 animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="w-10 h-10 text-[var(--color-accent)]" />
              </div>
            </div>

            <div className="text-center space-y-2">
              <h2 className="text-[16px] font-serif font-bold text-foreground">
                allo is writing your {GOALS.find((g) => g.id === goal)?.label} email…
              </h2>
              <p className="text-[13px] text-muted-foreground">
                Putting together the layout, subject line, and words
              </p>
            </div>

            <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-success)] rounded-full"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 1.3, ease: "easeInOut" }}
              />
            </div>
          </motion.div>
        )}

        {/* ================================================================ */}
        {/* STEP 3: Preview & Refine                                         */}
        {/* ================================================================ */}
        {step === 3 && !showAdvancedEditor && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {/* Back button */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-[11px] font-sans text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                Back to goals
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setStep(4)}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-sans font-bold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-all"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Split Pane */}
            <div className="flex gap-5 min-h-[600px]">
              {/* Left: Preview (60%) */}
              <div className="flex-[3] flex flex-col border border-border rounded-xl overflow-hidden bg-card">
                {/* Preview toolbar */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card">
                  <span className="text-[10px] uppercase tracking-[1px] font-sans text-muted-foreground font-bold">
                    PREVIEW
                  </span>
                  <div className="flex items-center rounded-lg border border-border overflow-hidden">
                    <button
                      onClick={() => setPreviewMode("desktop")}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 text-[10px] font-sans transition-colors",
                        previewMode === "desktop"
                          ? "bg-secondary text-secondary-foreground"
                          : "bg-card text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Monitor className="w-3 h-3" />
                      Desktop
                    </button>
                    <button
                      onClick={() => setPreviewMode("mobile")}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 text-[10px] font-sans transition-colors",
                        previewMode === "mobile"
                          ? "bg-secondary text-secondary-foreground"
                          : "bg-card text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Smartphone className="w-3 h-3" />
                      Mobile
                    </button>
                  </div>
                </div>

                {/* Iframe — always mounted to avoid ref timing issues */}
                <div className="flex-1 overflow-auto bg-muted flex justify-center p-4 relative">
                  {renderMut.isPending && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/80">
                      <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                    </div>
                  )}
                  <iframe
                    key={previewHtml ? "loaded" : "empty"}
                    srcDoc={previewHtml || "<html><body></body></html>"}
                    title="Email Preview"
                    className="bg-white border border-border rounded-lg shadow-sm transition-all"
                    style={{
                      width: previewMode === "desktop" ? 600 : 375,
                      minHeight: 500,
                      height: "100%",
                    }}
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>

              {/* Right: Refinement Panel (40%) */}
              <div className="flex-[2] flex flex-col gap-5 overflow-y-auto">
                {/* Template name */}
                <div className="bg-card dark:bg-[rgba(40,36,30,0.7)] border border-border dark:border-[rgba(200,180,150,0.12)] rounded-xl p-4 space-y-3">
                  <label className="text-[10px] uppercase tracking-[1px] font-sans text-muted-foreground font-bold">
                    TEMPLATE NAME
                  </label>
                  <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                    placeholder="Template name..."
                  />
                </div>

                {/* Subject Line */}
                <div className="bg-card dark:bg-[rgba(40,36,30,0.7)] border border-border dark:border-[rgba(200,180,150,0.12)] rounded-xl p-4 space-y-3">
                  <label className="text-[10px] uppercase tracking-[1px] font-sans text-muted-foreground font-bold">
                    SUBJECT LINE
                  </label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                    placeholder="Email subject..."
                  />
                  {/* Score badge */}
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[11px] font-mono font-bold", subjectScore.color)}>
                      {subjectScore.score}/100
                    </span>
                    <span className={cn("text-[10px] font-sans px-2 py-0.5 rounded-full", subjectScore.color, "bg-current/10")}>
                      {subjectScore.label}
                    </span>
                  </div>

                  {/* Suggest alternatives */}
                  <button
                    onClick={() => setShowAlternatives(!showAlternatives)}
                    className="text-[11px] font-sans text-[var(--color-accent)] hover:underline"
                  >
                    {showAlternatives ? "Hide alternatives" : "Suggest alternatives"}
                  </button>

                  <AnimatePresence>
                    {showAlternatives && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-1.5 overflow-hidden"
                      >
                        {subjectAlternatives.map((alt, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setSubject(alt);
                              setShowAlternatives(false);
                            }}
                            className="w-full text-left px-3 py-2 text-[11px] font-sans text-foreground bg-muted hover:bg-muted/80 border border-border rounded-lg transition-colors"
                          >
                            {alt}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Quick Adjustments */}
                <div className="bg-card dark:bg-[rgba(40,36,30,0.7)] border border-border dark:border-[rgba(200,180,150,0.12)] rounded-xl p-4 space-y-3">
                  <label className="text-[10px] uppercase tracking-[1px] font-sans text-muted-foreground font-bold">
                    QUICK ADJUSTMENTS
                  </label>

                  {/* Tone */}
                  <div>
                    <label className="text-[10px] font-sans text-muted-foreground block mb-1">
                      TONE
                    </label>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-sans text-foreground focus:outline-none"
                    >
                      {TONE_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* AI instruction */}
                  <div>
                    <label className="text-[10px] font-sans text-muted-foreground block mb-1">
                      AI INSTRUCTION
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={aiInstruction}
                        onChange={(e) => setAiInstruction(e.target.value)}
                        placeholder="Tell allo what to change…"
                        onKeyDown={(e) => e.key === "Enter" && handleRegenerate()}
                        className="flex-1 px-2.5 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                      />
                      <button
                        onClick={handleRegenerate}
                        disabled={regenerateMut?.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[var(--color-accent)] text-white rounded-lg text-[10px] font-sans font-bold hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-all"
                      >
                        <Wand2 className={cn("w-3 h-3", regenerateMut?.isPending && "animate-spin")} />
                        Regen
                      </button>
                    </div>
                  </div>
                </div>

                {/* Blocks */}
                <div className="bg-card dark:bg-[rgba(40,36,30,0.7)] border border-border dark:border-[rgba(200,180,150,0.12)] rounded-xl p-4 space-y-3">
                  <label className="text-[10px] uppercase tracking-[1px] font-sans text-muted-foreground font-bold">
                    BLOCKS ({blocks.length})
                  </label>

                  <div className="space-y-1">
                    {blocks.map((block) => (
                      <div
                        key={block.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/50 hover:bg-muted group transition-colors"
                      >
                        <span className="text-[12px]">
                          {BLOCK_TYPE_ICONS[block.type] || "\u25A0"}
                        </span>
                        <span className="text-[11px] font-sans text-foreground flex-1">
                          {BLOCK_TYPE_LABELS[block.type] || block.type}
                        </span>
                        <button
                          onClick={() => handleDeleteBlock(block.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-red-500 transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setShowAdvancedEditor(true)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-border rounded-lg text-[11px] font-sans text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Edit Blocks
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ================================================================ */}
        {/* STEP 3b: Advanced Block Editor                                   */}
        {/* ================================================================ */}
        {step === 3 && showAdvancedEditor && (
          <motion.div
            key="step3b"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAdvancedEditor(false)}
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-sans text-muted-foreground border border-border rounded-lg hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                Back to Preview
              </button>
              <span className="text-[10px] uppercase tracking-[1px] font-sans text-muted-foreground font-bold">
                BLOCK EDITOR
              </span>
            </div>

            <div className="h-[calc(100vh-220px)] border border-border rounded-xl overflow-hidden">
              <EmailCanvas
                initialBlocks={blocks}
                onSave={handleCanvasSave}
              />
            </div>
          </motion.div>
        )}

        {/* ================================================================ */}
        {/* STEP 4: Ship It                                                  */}
        {/* ================================================================ */}
        {step === 4 && (
          <motion.div
            key="step4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Back button */}
            <button
              onClick={() => setStep(3)}
              className="flex items-center gap-1 text-[11px] font-sans text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to preview
            </button>

            <div className="text-center space-y-2 py-6">
              <h2 className="text-[20px] font-serif font-bold text-foreground tracking-[-0.5px]">
                Your email is ready!
              </h2>
              <p className="text-[13px] text-muted-foreground max-w-md mx-auto">
                &ldquo;{templateName}&rdquo; with {blocks.length} blocks is ready to go. What would you like to do?
              </p>
            </div>

            {/* Summary card */}
            <div className="max-w-lg mx-auto bg-card dark:bg-[rgba(40,36,30,0.7)] border border-border dark:border-[rgba(200,180,150,0.12)] rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-accent)]/15 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-[var(--color-accent)]" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-foreground">{templateName}</p>
                  <p className="text-[11px] text-muted-foreground">{subject}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-sans text-muted-foreground">
                <span>{blocks.length} blocks</span>
                <span>\u2022</span>
                <span>Goal: {GOALS.find((g) => g.id === goal)?.label}</span>
                <span>\u2022</span>
                <span className={subjectScore.color}>Subject score: {subjectScore.score}/100</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="max-w-lg mx-auto grid grid-cols-1 gap-3">
              {/* Save as Template */}
              <button
                onClick={handleSaveTemplate}
                disabled={createMut.isPending}
                className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-[13px] font-sans font-bold transition-all bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
              >
                {createMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save as Template
              </button>

              {/* Launch as Campaign */}
              <button
                onClick={handleLaunchCampaign}
                disabled={createMut.isPending}
                className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-[13px] font-sans font-bold transition-all border-2 border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                Launch as Campaign
              </button>

              {/* Use in Automation */}
              <button
                onClick={handleUseInAutomation}
                className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-[13px] font-sans font-bold transition-all border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              >
                <Settings2 className="w-4 h-4" />
                Use in Automation
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
