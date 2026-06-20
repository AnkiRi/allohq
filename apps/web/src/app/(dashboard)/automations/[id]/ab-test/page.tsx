"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  FlaskConical,
  Plus,
  Play,
  X,
  Trophy,
  BarChart3,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const VARIABLE_OPTIONS = [
  { value: "subject_line", label: "Subject Line" },
  { value: "send_time", label: "Send Time" },
  { value: "discount_level", label: "Discount Level" },
  { value: "channel", label: "Channel" },
  { value: "content", label: "Content" },
] as const;

const CHANNEL_OPTIONS = ["email", "sms", "whatsapp", "rcs"];

type ABTestVariable = "subject_line" | "send_time" | "discount_level" | "channel" | "content";

// ---------------------------------------------------------------------------
// AI-recommended A/B test variants per variable × automation category
// ---------------------------------------------------------------------------

type CategoryKey = "cart_abandonment" | "win_back" | "post_purchase" | "welcome_series" | "vip_reward" | "cross_sell" | "promotional" | "default";

interface VariantSuggestion {
  a: string;
  b: string;
  label: string; // explains the test hypothesis
}

const SUGGESTIONS: Record<ABTestVariable, Record<CategoryKey, VariantSuggestion[]>> = {
  subject_line: {
    cart_abandonment: [
      { a: "You left something behind 🛒", b: "Still thinking it over, {{first_name}}?", label: "Emoji urgency vs personal tone" },
      { a: "Your cart is waiting — complete your order", b: "Don't miss out! Items in your cart are selling fast", label: "Neutral reminder vs scarcity" },
      { a: "Forgot something? Here's 10% off to finish up", b: "Your cart expires in 24 hours", label: "Discount incentive vs deadline pressure" },
    ],
    win_back: [
      { a: "We miss you, {{first_name}}!", b: "It's been a while — here's what's new", label: "Emotional appeal vs curiosity" },
      { a: "Come back for 15% off your next order", b: "{{first_name}}, we saved something special for you", label: "Discount lead vs exclusivity" },
      { a: "Your favorites are back in stock", b: "See what you've been missing", label: "Product-specific vs general FOMO" },
    ],
    post_purchase: [
      { a: "Thanks for your order! Here's what's next", b: "Your order is on its way, {{first_name}} 🎉", label: "Informational vs celebratory" },
      { a: "How to get the most from your purchase", b: "You might also love these", label: "Value-add tips vs cross-sell" },
      { a: "How was your experience?", b: "Rate your purchase & get 10% off next time", label: "Simple ask vs incentivized review" },
    ],
    welcome_series: [
      { a: "Welcome to the family, {{first_name}}! 🎉", b: "You're in! Here's your exclusive welcome offer", label: "Warm welcome vs offer-first" },
      { a: "Here's what to expect from us", b: "Your first perk is inside 👀", label: "Setting expectations vs mystery/curiosity" },
      { a: "Nice to meet you! Quick question...", b: "Welcome aboard — 15% off your first order inside", label: "Engagement-first vs discount-first" },
    ],
    vip_reward: [
      { a: "You've unlocked VIP status, {{first_name}}!", b: "Exclusive: early access just for our top customers", label: "Achievement vs exclusivity" },
      { a: "A thank you gift from us 🎁", b: "VIP-only: 20% off everything this weekend", label: "Surprise gift vs clear discount" },
      { a: "You're one of our best — here's proof", b: "Special reward inside (VIP eyes only)", label: "Recognition vs mystery reward" },
    ],
    cross_sell: [
      { a: "Complete the look — items that go with your purchase", b: "Customers who bought this also loved...", label: "Direct suggestion vs social proof" },
      { a: "Pair it perfectly: curated picks for you", b: "Don't forget the essentials ✨", label: "Curated vs utility-focused" },
      { a: "We think you'd love these too", b: "Before your order ships — add these for free shipping", label: "Soft recommendation vs shipping incentive" },
    ],
    promotional: [
      { a: "Flash sale: up to 40% off today only ⚡", b: "{{first_name}}, this deal won't last long", label: "Broad excitement vs personal urgency" },
      { a: "Your exclusive offer is waiting inside", b: "New arrivals + a special surprise for you", label: "Offer-first vs product-first" },
      { a: "24 hours only: biggest sale of the season", b: "We picked these deals just for you, {{first_name}}", label: "Mass urgency vs personalized curation" },
    ],
    default: [
      { a: "{{first_name}}, you'll want to see this", b: "Something special, just for you ✨", label: "Name personalization vs curiosity" },
      { a: "Don't miss this — open for a surprise", b: "Quick update from us (1 min read)", label: "Mystery vs low-commitment" },
      { a: "Big news inside!", b: "A personal note for you, {{first_name}}", label: "Excitement vs intimacy" },
    ],
  },
  send_time: {
    cart_abandonment: [
      { a: "10:00", b: "20:00", label: "Morning nudge vs evening reminder" },
      { a: "09:00", b: "13:00", label: "Pre-work vs lunch break" },
    ],
    win_back: [
      { a: "10:00", b: "18:00", label: "Morning fresh vs evening wind-down" },
      { a: "11:00", b: "15:00", label: "Mid-morning vs mid-afternoon" },
    ],
    post_purchase: [
      { a: "09:00", b: "14:00", label: "Start of day vs afternoon" },
    ],
    welcome_series: [
      { a: "09:00", b: "12:00", label: "Early morning vs noon" },
    ],
    vip_reward: [
      { a: "10:00", b: "19:00", label: "Business hours vs evening treat" },
    ],
    cross_sell: [
      { a: "11:00", b: "17:00", label: "Late morning vs end of workday" },
    ],
    promotional: [
      { a: "08:00", b: "12:00", label: "Early bird vs lunch impulse buy" },
      { a: "10:00", b: "20:00", label: "Morning vs evening shopping" },
    ],
    default: [
      { a: "10:00", b: "18:00", label: "Morning vs evening" },
      { a: "09:00", b: "14:00", label: "Start of day vs afternoon" },
    ],
  },
  discount_level: {
    cart_abandonment: [
      { a: "10", b: "15", label: "Small nudge (10%) vs moderate incentive (15%)" },
      { a: "5", b: "20", label: "Minimal (5%) vs strong pull (20%) — test price sensitivity" },
    ],
    win_back: [
      { a: "15", b: "25", label: "Standard (15%) vs aggressive (25%) re-engagement" },
      { a: "10", b: "20", label: "Light discount vs compelling return offer" },
    ],
    post_purchase: [
      { a: "5", b: "10", label: "Token thank-you (5%) vs meaningful repeat incentive (10%)" },
    ],
    welcome_series: [
      { a: "10", b: "20", label: "Welcome perk (10%) vs strong first-purchase push (20%)" },
    ],
    vip_reward: [
      { a: "15", b: "25", label: "Standard VIP (15%) vs premium VIP (25%)" },
    ],
    cross_sell: [
      { a: "0", b: "10", label: "No discount (pure recommendation) vs 10% bundle incentive" },
    ],
    promotional: [
      { a: "20", b: "30", label: "Moderate sale (20%) vs big event (30%)" },
      { a: "15", b: "40", label: "Conservative vs aggressive — test margin impact" },
    ],
    default: [
      { a: "10", b: "20", label: "Standard (10%) vs strong (20%)" },
    ],
  },
  channel: {
    cart_abandonment: [
      { a: "email", b: "sms", label: "Email (detailed) vs SMS (immediate)" },
    ],
    win_back: [
      { a: "email", b: "whatsapp", label: "Email (visual) vs WhatsApp (conversational)" },
    ],
    post_purchase: [
      { a: "email", b: "sms", label: "Email (receipt-style) vs SMS (quick thanks)" },
    ],
    welcome_series: [
      { a: "email", b: "whatsapp", label: "Email (comprehensive) vs WhatsApp (personal)" },
    ],
    vip_reward: [
      { a: "email", b: "sms", label: "Email (rich reward reveal) vs SMS (instant gratification)" },
    ],
    cross_sell: [
      { a: "email", b: "sms", label: "Email (visual products) vs SMS (quick link)" },
    ],
    promotional: [
      { a: "email", b: "sms", label: "Email (full campaign) vs SMS (flash alert)" },
      { a: "sms", b: "whatsapp", label: "SMS (broadcast) vs WhatsApp (two-way)" },
    ],
    default: [
      { a: "email", b: "sms", label: "Email vs SMS" },
    ],
  },
  content: {
    cart_abandonment: [
      { a: "Show cart items with images and a single CTA button", b: "Short text with urgency message and discount code", label: "Visual product reminder vs urgency + incentive" },
      { a: "Friendly tone: 'Looks like you forgot something!'", b: "Direct tone: 'Complete your purchase before items sell out'", label: "Casual vs urgent tone" },
    ],
    win_back: [
      { a: "Highlight what's new since their last visit", b: "Personalized picks based on past purchases", label: "New arrivals vs personalized recommendations" },
      { a: "Story-driven: 'A lot has changed since you were here...'", b: "Offer-driven: 'Here's 15% off to welcome you back'", label: "Narrative engagement vs direct incentive" },
    ],
    post_purchase: [
      { a: "Product care tips and how-to guide", b: "Related products they might love", label: "Value content vs cross-sell" },
      { a: "Ask for review with star rating", b: "Share on social media prompt with discount for next order", label: "Review ask vs social sharing" },
    ],
    welcome_series: [
      { a: "Brand story with founder's note", b: "Bestsellers showcase with welcome discount", label: "Brand building vs product-first" },
      { a: "Three reasons customers love us (social proof)", b: "Your welcome gift: exclusive first-order perk", label: "Social proof vs immediate reward" },
    ],
    vip_reward: [
      { a: "Exclusive early access to new collection", b: "Mystery gift — click to reveal your reward", label: "Early access vs gamified surprise" },
      { a: "Personalized thank you with purchase history stats", b: "VIP-only flash sale (24h)", label: "Recognition vs exclusive deal" },
    ],
    cross_sell: [
      { a: "Complete the set — styled outfit/bundle suggestions", b: "Top 3 items other customers bought together", label: "Curated bundle vs social proof" },
    ],
    promotional: [
      { a: "Countdown timer + hero product image", b: "Grid of top deals with prices", label: "Single hero vs multi-product" },
      { a: "Minimal design with one bold CTA", b: "Rich content with testimonials and product grid", label: "Simple urgency vs comprehensive persuasion" },
    ],
    default: [
      { a: "Clean, minimal design with single CTA", b: "Rich content with images, testimonials, and multiple sections", label: "Minimal vs comprehensive" },
      { a: "Personalized greeting with curated picks", b: "Bold headline with featured offer", label: "Personal touch vs promotional impact" },
    ],
  },
};

/** Map automation category strings to our CategoryKey */
function getCategoryKey(category: string | null | undefined): CategoryKey {
  const map: Record<string, CategoryKey> = {
    cart_abandonment: "cart_abandonment",
    win_back: "win_back",
    post_purchase: "post_purchase",
    welcome_series: "welcome_series",
    vip_reward: "vip_reward",
    cross_sell: "cross_sell",
    promotional: "promotional",
  };
  return map[category ?? ""] ?? "default";
}

interface ABTestRecord {
  id: string;
  name: string;
  variable: string;
  status: string;
  winner: string | null;
  confidence: number | null;
  splitRatio: number;
  minSampleSize: number;
  variantA: Record<string, unknown>;
  variantB: Record<string, unknown>;
  results: Record<string, { sent: number; opened: number; clicked: number; converted: number; revenue: number }>;
  startedAt: string;
  concludedAt: string | null;
  storeId: string;
  automationId: string | null;
}

export default function ABTestPage() {
  const params = useParams();
  const automationId = params.id as string;
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [variable, setVariable] = useState<ABTestVariable>("subject_line");
  const [variantAValue, setVariantAValue] = useState("");
  const [variantBValue, setVariantBValue] = useState("");
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [minSampleSize, setMinSampleSize] = useState(200);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState<number | null>(null);

  // Fetch automation to get storeId
  type AutomationBasic = { id: string; name: string; storeId: string; status: string; category: string | null };
  const { data: automation } = (trpc.automations.getById as any).useQuery(
    { id: automationId },
    { enabled: !!automationId }
  ) as { data: AutomationBasic | undefined };

  // AI-recommended suggestions for current variable + automation category
  const categoryKey = getCategoryKey(automation?.category);
  const currentSuggestions = useMemo(
    () => SUGGESTIONS[variable]?.[categoryKey] ?? SUGGESTIONS[variable]?.default ?? [],
    [variable, categoryKey]
  );

  // Fetch A/B tests
  const { data: abTests, isLoading } = (trpc.automations.listABTests as any).useQuery(
    { automationId },
    { enabled: !!automationId, refetchInterval: 5000 }
  ) as { data: ABTestRecord[] | undefined; isLoading: boolean };

  const utils = trpc.useUtils();

  const createMut = (trpc.automations.createABTest as any).useMutation({
    onSuccess: () => {
      (utils.automations as any).listABTests.invalidate({ automationId });
      toast("Your test is ready.", "success");
      resetForm();
    },
    onError: (err: { message?: string }) => toast(err.message || "We couldn't create that test. Mind trying again?", "error"),
  }) as { mutate: (input: any) => void; isPending: boolean };

  const updateMut = (trpc.automations.updateABTest as any).useMutation({
    onSuccess: () => {
      (utils.automations as any).listABTests.invalidate({ automationId });
      toast("Test updated.", "success");
    },
    onError: (err: { message?: string }) => toast(err.message || "We couldn't update that test. Mind trying again?", "error"),
  }) as { mutate: (input: any) => void; isPending: boolean };

  const deleteMut = (trpc.automations.deleteABTest as any).useMutation({
    onSuccess: () => {
      (utils.automations as any).listABTests.invalidate({ automationId });
      toast("Test deleted.", "info");
    },
    onError: (err: { message?: string }) => toast(err.message || "We couldn't delete that test. Mind trying again?", "error"),
  }) as { mutate: (input: any) => void; isPending: boolean };

  function resetForm() {
    setShowForm(false);
    setName("");
    setVariable("subject_line");
    setVariantAValue("");
    setVariantBValue("");
    setSplitRatio(0.5);
    setMinSampleSize(200);
    setSelectedSuggestionIdx(null);
  }

  function applySuggestion(idx: number) {
    const s = currentSuggestions[idx];
    if (!s) return;
    setVariantAValue(s.a);
    setVariantBValue(s.b);
    setSelectedSuggestionIdx(idx);
    if (!name.trim()) {
      const varLabel = VARIABLE_OPTIONS.find((v) => v.value === variable)?.label ?? variable;
      setName(`${varLabel} test: ${s.label}`);
    }
  }

  function buildVariant(val: string): Record<string, unknown> {
    switch (variable) {
      case "subject_line":
        return { value: val, description: `Subject: ${val}` };
      case "send_time":
        return { value: val, description: `Send at ${val}` };
      case "discount_level":
        return { value: Number(val) || 0, description: `${val}% discount` };
      case "channel":
        return { value: val, description: `Channel: ${val}` };
      case "content":
        return { value: val, description: `Content variant` };
      default:
        return { value: val };
    }
  }

  function handleCreate() {
    if (!automation?.storeId || !name.trim() || !variantAValue.trim() || !variantBValue.trim()) {
      toast("Just need a few more details before we start.", "error");
      return;
    }
    createMut.mutate({
      storeId: automation.storeId,
      automationId,
      name: name.trim(),
      variable,
      variantA: buildVariant(variantAValue),
      variantB: buildVariant(variantBValue),
      splitRatio,
      minSampleSize,
    });
  }

  function handleStartTest(testId: string) {
    updateMut.mutate({ id: testId, status: "running" });
  }

  function handleCancelTest(testId: string) {
    updateMut.mutate({ id: testId, status: "cancelled" });
  }

  function handleDeleteTest(testId: string) {
    deleteMut.mutate({ id: testId });
  }

  function handleApplyWinner(test: ABTestRecord) {
    // Apply the winning variant config to the automation
    // This is a placeholder - in production it would update the automation's trigger/node config
    toast(`Variant ${test.winner?.toUpperCase()} is now the one you're sending.`, "success");
  }

  function getOpenRate(r: { sent: number; opened: number }) {
    return r.sent > 0 ? ((r.opened / r.sent) * 100).toFixed(1) : "0.0";
  }
  function getClickRate(r: { opened: number; clicked: number }) {
    return r.opened > 0 ? ((r.clicked / r.opened) * 100).toFixed(1) : "0.0";
  }
  function getConvRate(r: { sent: number; converted: number }) {
    return r.sent > 0 ? ((r.converted / r.sent) * 100).toFixed(1) : "0.0";
  }

  const runningTests = abTests?.filter((t) => t.status === "running") ?? [];
  const draftTests = abTests?.filter((t) => t.status === "draft") ?? [];
  const concludedTests = abTests?.filter((t) => t.status === "concluded") ?? [];
  const cancelledTests = abTests?.filter((t) => t.status === "cancelled") ?? [];

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/automations/${automationId}`} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-[18px] tracking-[-0.5px] font-semibold text-foreground font-serif flex items-center gap-2">
              <FlaskConical className="w-4 h-4" />
              A/B tests
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {automation?.name ?? "..."} &mdash; {abTests?.length ?? 0} test{(abTests?.length ?? 0) !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-xs font-sans font-bold hover:opacity-90 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          New Test
        </button>
      </motion.div>

      {/* Creation Form */}
      {showForm && (
        <motion.div
          variants={itemVariants}
          className="border border-border rounded-xl bg-card overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Plus className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-[13px] font-bold text-foreground font-serif">New A/B test</h2>
            </div>
            <button onClick={resetForm} className="p-1.5 rounded hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="p-6 space-y-5">
            {/* Test Name */}
            <div>
              <label className="text-[10px] font-sans text-muted-foreground uppercase font-bold tracking-[1px] block mb-1.5">
                Test Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Welcome email subject test"
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[13px] font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>

            {/* Variable */}
            <div>
              <label className="text-[10px] font-sans text-muted-foreground uppercase font-bold tracking-[1px] block mb-1.5">
                Variable to Test
              </label>
              <select
                value={variable}
                onChange={(e) => {
                  setVariable(e.target.value as ABTestVariable);
                  setVariantAValue("");
                  setVariantBValue("");
                  setSelectedSuggestionIdx(null);
                }}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                {VARIABLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* AI Recommendations */}
            {currentSuggestions.length > 0 && (
              <div>
                <label className="text-[10px] font-sans text-muted-foreground uppercase font-bold tracking-[1px] flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  allo's suggestions
                </label>
                <div className="space-y-2">
                  {currentSuggestions.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => applySuggestion(idx)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        selectedSuggestionIdx === idx
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5 ring-1 ring-[var(--color-accent)]/30"
                          : "border-border bg-muted/30 hover:border-muted-foreground/30 hover:bg-muted/50"
                      }`}
                    >
                      <p className="text-[11px] font-bold text-foreground mb-1">{s.label}</p>
                      <div className="flex items-center gap-3 text-[10px] font-sans text-muted-foreground">
                        <span className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded text-blue-700 dark:text-blue-300 truncate max-w-[45%]">
                          A: {s.a}
                        </span>
                        <span className="text-muted-foreground/40">vs</span>
                        <span className="px-1.5 py-0.5 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded text-purple-700 dark:text-purple-300 truncate max-w-[45%]">
                          B: {s.b}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                  Pick one to start, then tweak it however you like.
                </p>
              </div>
            )}

            {/* Variant Editors */}
            <div className="grid grid-cols-2 gap-4">
              {/* Variant A */}
              <div className="p-4 rounded-lg border border-border bg-muted/30">
                <label className="text-[10px] font-sans text-muted-foreground uppercase font-bold tracking-[1px] block mb-1.5">
                  Variant A
                </label>
                {variable === "subject_line" && (
                  <input
                    type="text"
                    value={variantAValue}
                    onChange={(e) => setVariantAValue(e.target.value)}
                    placeholder="Enter subject line A"
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  />
                )}
                {variable === "send_time" && (
                  <input
                    type="time"
                    value={variantAValue}
                    onChange={(e) => setVariantAValue(e.target.value)}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  />
                )}
                {variable === "discount_level" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={variantAValue}
                      onChange={(e) => setVariantAValue(e.target.value)}
                      placeholder="10"
                      min={0}
                      max={100}
                      className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-[13px] font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                    />
                    <span className="text-[13px] font-sans text-muted-foreground">%</span>
                  </div>
                )}
                {variable === "channel" && (
                  <select
                    value={variantAValue}
                    onChange={(e) => setVariantAValue(e.target.value)}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  >
                    <option value="">Select channel</option>
                    {CHANNEL_OPTIONS.map((ch) => (
                      <option key={ch} value={ch}>{ch.toUpperCase()}</option>
                    ))}
                  </select>
                )}
                {variable === "content" && (
                  <textarea
                    value={variantAValue}
                    onChange={(e) => setVariantAValue(e.target.value)}
                    placeholder="Enter content for variant A"
                    rows={4}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] resize-none"
                  />
                )}
              </div>

              {/* Variant B */}
              <div className="p-4 rounded-lg border border-border bg-muted/30">
                <label className="text-[10px] font-sans text-muted-foreground uppercase font-bold tracking-[1px] block mb-1.5">
                  Variant B
                </label>
                {variable === "subject_line" && (
                  <input
                    type="text"
                    value={variantBValue}
                    onChange={(e) => setVariantBValue(e.target.value)}
                    placeholder="Enter subject line B"
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  />
                )}
                {variable === "send_time" && (
                  <input
                    type="time"
                    value={variantBValue}
                    onChange={(e) => setVariantBValue(e.target.value)}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  />
                )}
                {variable === "discount_level" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={variantBValue}
                      onChange={(e) => setVariantBValue(e.target.value)}
                      placeholder="20"
                      min={0}
                      max={100}
                      className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-[13px] font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                    />
                    <span className="text-[13px] font-sans text-muted-foreground">%</span>
                  </div>
                )}
                {variable === "channel" && (
                  <select
                    value={variantBValue}
                    onChange={(e) => setVariantBValue(e.target.value)}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  >
                    <option value="">Select channel</option>
                    {CHANNEL_OPTIONS.map((ch) => (
                      <option key={ch} value={ch}>{ch.toUpperCase()}</option>
                    ))}
                  </select>
                )}
                {variable === "content" && (
                  <textarea
                    value={variantBValue}
                    onChange={(e) => setVariantBValue(e.target.value)}
                    placeholder="Enter content for variant B"
                    rows={4}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] resize-none"
                  />
                )}
              </div>
            </div>

            {/* Split Ratio */}
            <div>
              <label className="text-[10px] font-sans text-muted-foreground uppercase font-bold tracking-[1px] block mb-1.5">
                Split Ratio
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={10}
                  max={90}
                  step={5}
                  value={splitRatio * 100}
                  onChange={(e) => setSplitRatio(Number(e.target.value) / 100)}
                  className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-[var(--color-accent)]"
                />
                <div className="flex items-center gap-2 text-[11px] font-mono text-foreground min-w-[120px]">
                  <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-blue-700">
                    A: {Math.round(splitRatio * 100)}%
                  </span>
                  <span className="px-2 py-0.5 bg-purple-50 border border-purple-200 rounded text-purple-700">
                    B: {Math.round((1 - splitRatio) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Min Sample Size */}
            <div>
              <label className="text-[10px] font-sans text-muted-foreground uppercase font-bold tracking-[1px] block mb-1.5">
                Minimum Sample Size
              </label>
              <input
                type="number"
                value={minSampleSize}
                onChange={(e) => setMinSampleSize(Math.max(50, Number(e.target.value) || 50))}
                min={50}
                className="w-48 px-3 py-2 bg-muted border border-border rounded-lg text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                How many sends to gather before we call a winner (at least 50).
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={createMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-xs font-sans font-bold hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {createMut.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FlaskConical className="w-3.5 h-3.5" />
                )}
                Create Test
              </button>
              <button
                onClick={resetForm}
                className="px-4 py-2 border border-border rounded-lg text-xs font-sans text-foreground hover:bg-muted transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 glass-skeleton rounded-xl" />
          ))}
        </div>
      )}

      {/* Draft Tests */}
      {draftTests.length > 0 && (
        <motion.div variants={itemVariants}>
          <h2 className="text-[11px] font-sans text-muted-foreground uppercase font-bold tracking-[1px] mb-3">
            Draft Tests
          </h2>
          <div className="space-y-3">
            {draftTests.map((test) => (
              <div
                key={test.id}
                className="border border-dashed border-white/40 rounded-xl bg-card p-5 hover:border-white/60 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-[13px] font-bold font-serif text-foreground">{test.name}</h3>
                    <span className="text-[10px] font-sans text-muted-foreground uppercase">
                      {test.variable.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-sans bg-white/15 text-muted-foreground border border-white/10">
                      draft
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 rounded-lg border border-border bg-muted/30">
                    <div className="text-[10px] font-sans font-bold text-muted-foreground mb-1">VARIANT A ({Math.round(test.splitRatio * 100)}%)</div>
                    <div className="text-[12px] font-sans text-foreground truncate">
                      {String((test.variantA as any)?.value ?? "")}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-border bg-muted/30">
                    <div className="text-[10px] font-sans font-bold text-muted-foreground mb-1">VARIANT B ({Math.round((1 - test.splitRatio) * 100)}%)</div>
                    <div className="text-[12px] font-sans text-foreground truncate">
                      {String((test.variantB as any)?.value ?? "")}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleStartTest(test.id)}
                    disabled={updateMut.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-success)] text-white rounded-lg text-xs font-sans font-bold hover:opacity-90 disabled:opacity-50 transition-all"
                  >
                    <Play className="w-3 h-3" />
                    Start Test
                  </button>
                  <button
                    onClick={() => handleDeleteTest(test.id)}
                    disabled={deleteMut.isPending}
                    className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs font-sans text-muted-foreground hover:text-red-500 hover:border-red-300 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Running Tests */}
      {runningTests.length > 0 && (
        <motion.div variants={itemVariants}>
          <h2 className="text-[11px] font-sans text-muted-foreground uppercase font-bold tracking-[1px] mb-3">
            Running Tests
          </h2>
          <div className="space-y-3">
            {runningTests.map((test) => {
              const a = test.results?.["a"] ?? { sent: 0, opened: 0, clicked: 0, converted: 0, revenue: 0 };
              const b = test.results?.["b"] ?? { sent: 0, opened: 0, clicked: 0, converted: 0, revenue: 0 };
              const totalSent = a.sent + b.sent;
              const progress = Math.min((totalSent / test.minSampleSize) * 100, 100);

              return (
                <div
                  key={test.id}
                  className="border border-border rounded-xl bg-card p-5 border-l-4 border-l-blue-500"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-[13px] font-bold font-serif text-foreground">{test.name}</h3>
                      <span className="text-[10px] font-sans text-muted-foreground uppercase">
                        {test.variable.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-sans bg-blue-50 text-blue-700 border border-blue-200">
                        running
                      </span>
                      {test.confidence != null && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {(test.confidence * 100).toFixed(1)}% confidence
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        Samples: {totalSent} / {test.minSampleSize}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {progress.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Results comparison */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 rounded-lg border border-border bg-muted/30">
                      <div className="text-[10px] font-sans font-bold text-muted-foreground mb-2">
                        VARIANT A &mdash; {String((test.variantA as any)?.value ?? "").slice(0, 30)}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <div className="text-[14px] font-bold font-mono text-foreground">{getOpenRate(a)}%</div>
                          <div className="text-[9px] font-sans text-muted-foreground uppercase">Open</div>
                        </div>
                        <div>
                          <div className="text-[14px] font-bold font-mono text-foreground">{getClickRate(a)}%</div>
                          <div className="text-[9px] font-sans text-muted-foreground uppercase">Click</div>
                        </div>
                        <div>
                          <div className="text-[14px] font-bold font-mono text-foreground">{getConvRate(a)}%</div>
                          <div className="text-[9px] font-sans text-muted-foreground uppercase">Conv</div>
                        </div>
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground mt-1">
                        {a.sent} sent &middot; ₹{a.revenue.toFixed(2)} rev
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border border-border bg-muted/30">
                      <div className="text-[10px] font-sans font-bold text-muted-foreground mb-2">
                        VARIANT B &mdash; {String((test.variantB as any)?.value ?? "").slice(0, 30)}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <div className="text-[14px] font-bold font-mono text-foreground">{getOpenRate(b)}%</div>
                          <div className="text-[9px] font-sans text-muted-foreground uppercase">Open</div>
                        </div>
                        <div>
                          <div className="text-[14px] font-bold font-mono text-foreground">{getClickRate(b)}%</div>
                          <div className="text-[9px] font-sans text-muted-foreground uppercase">Click</div>
                        </div>
                        <div>
                          <div className="text-[14px] font-bold font-mono text-foreground">{getConvRate(b)}%</div>
                          <div className="text-[9px] font-sans text-muted-foreground uppercase">Conv</div>
                        </div>
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground mt-1">
                        {b.sent} sent &middot; ₹{b.revenue.toFixed(2)} rev
                      </div>
                    </div>
                  </div>

                  {/* Confidence Indicator */}
                  {test.confidence != null && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <BarChart3 className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] font-sans text-muted-foreground uppercase">Statistical Confidence</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            test.confidence >= 0.95 ? "bg-green-500" :
                            test.confidence >= 0.8 ? "bg-amber-500" :
                            "bg-red-400"
                          }`}
                          style={{ width: `${test.confidence * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-[9px] font-mono text-muted-foreground">0%</span>
                        <span className={`text-[9px] font-mono ${
                          test.confidence >= 0.95 ? "text-green-600 font-bold" : "text-muted-foreground"
                        }`}>
                          {(test.confidence * 100).toFixed(1)}%
                        </span>
                        <span className="text-[9px] font-mono text-muted-foreground">100%</span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => handleCancelTest(test.id)}
                    disabled={updateMut.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-sans text-muted-foreground hover:text-red-500 hover:border-red-300 transition-all"
                  >
                    <XCircle className="w-3 h-3" />
                    Cancel Test
                  </button>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Concluded Tests */}
      {concludedTests.length > 0 && (
        <motion.div variants={itemVariants}>
          <h2 className="text-[11px] font-sans text-muted-foreground uppercase font-bold tracking-[1px] mb-3">
            Concluded Tests
          </h2>
          <div className="space-y-3">
            {concludedTests.map((test) => {
              const a = test.results?.["a"] ?? { sent: 0, opened: 0, clicked: 0, converted: 0, revenue: 0 };
              const b = test.results?.["b"] ?? { sent: 0, opened: 0, clicked: 0, converted: 0, revenue: 0 };

              return (
                <div
                  key={test.id}
                  className="border border-border rounded-xl bg-card p-5 border-l-4 border-l-green-500"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-[13px] font-bold font-serif text-foreground">{test.name}</h3>
                      <span className="text-[10px] font-sans text-muted-foreground uppercase">
                        {test.variable.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-sans bg-green-50 text-green-700 border border-green-200">
                        concluded
                      </span>
                      {test.winner && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-[10px] font-sans font-bold flex items-center gap-1">
                          <Trophy className="w-3 h-3" />
                          Winner: {test.winner.toUpperCase()}
                        </span>
                      )}
                      {test.confidence != null && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {(test.confidence * 100).toFixed(1)}% confidence
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Results */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {["a", "b"].map((variant) => {
                      const r = variant === "a" ? a : b;
                      const isWinner = test.winner === variant;
                      const variantData = variant === "a" ? test.variantA : test.variantB;
                      return (
                        <div
                          key={variant}
                          className={`p-3 rounded-lg border ${
                            isWinner ? "border-green-300 bg-green-50" : "border-border bg-muted/30"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-sans font-bold text-muted-foreground">
                              VARIANT {variant.toUpperCase()}
                            </span>
                            {isWinner && <Trophy className="w-3 h-3 text-green-600" />}
                          </div>
                          <div className="text-[11px] font-sans text-foreground mb-2 truncate">
                            {String((variantData as any)?.value ?? "")}
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <div className="text-[14px] font-bold font-mono text-foreground">{getOpenRate(r)}%</div>
                              <div className="text-[9px] font-sans text-muted-foreground uppercase">Open</div>
                            </div>
                            <div>
                              <div className="text-[14px] font-bold font-mono text-foreground">{getClickRate(r)}%</div>
                              <div className="text-[9px] font-sans text-muted-foreground uppercase">Click</div>
                            </div>
                            <div>
                              <div className="text-[14px] font-bold font-mono text-foreground">{getConvRate(r)}%</div>
                              <div className="text-[9px] font-sans text-muted-foreground uppercase">Conv</div>
                            </div>
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground mt-1">
                            {r.sent} sent &middot; ₹{r.revenue.toFixed(2)} rev
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {test.winner && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApplyWinner(test)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-success)] text-white rounded-lg text-xs font-sans font-bold hover:opacity-90 transition-all"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Apply Winner
                      </button>
                      <button
                        onClick={() => handleDeleteTest(test.id)}
                        disabled={deleteMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs font-sans text-muted-foreground hover:text-red-500 hover:border-red-300 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Cancelled Tests */}
      {cancelledTests.length > 0 && (
        <motion.div variants={itemVariants}>
          <h2 className="text-[11px] font-sans text-muted-foreground uppercase font-bold tracking-[1px] mb-3">
            Cancelled Tests
          </h2>
          <div className="space-y-3">
            {cancelledTests.map((test) => (
              <div
                key={test.id}
                className="border border-border rounded-xl bg-card p-5 opacity-60"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[13px] font-bold font-serif text-foreground">{test.name}</h3>
                    <span className="text-[10px] font-sans text-muted-foreground uppercase">
                      {test.variable.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-sans bg-gray-50 text-gray-600 border border-gray-200">
                      cancelled
                    </span>
                    <button
                      onClick={() => handleDeleteTest(test.id)}
                      disabled={deleteMut.isPending}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-sans text-muted-foreground hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {!isLoading && (!abTests || abTests.length === 0) && !showForm && (
        <motion.div variants={itemVariants} className="text-center py-16">
          <FlaskConical className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-[13px] font-bold text-foreground font-serif mb-1">No tests yet</h3>
          <p className="text-[11px] text-muted-foreground font-sans mb-4">
            Try two versions against each other and let the results tell you what works.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-xs font-sans font-bold hover:opacity-90 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            New Test
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
