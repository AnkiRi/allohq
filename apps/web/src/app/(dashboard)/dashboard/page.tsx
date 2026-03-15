"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  Brain,
  Zap,
  Store,
  Check,
  Sparkles,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

// ---------------------------------------------------------------------------
// Motion variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

// ---------------------------------------------------------------------------
// Sparkline — inline SVG polyline
// ---------------------------------------------------------------------------

function Sparkline({
  data,
  color = "var(--color-success)",
  width = 80,
  height = 20,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// AnimatedNumber — framer-motion count-up
// ---------------------------------------------------------------------------

function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const motionVal = useMotionValue(0);
  const display = useTransform(motionVal, (v) => {
    const formatted = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString();
    return `${prefix}${formatted}${suffix}`;
  });

  useEffect(() => {
    const controls = animate(motionVal, value, {
      duration: 1.2,
      ease: "easeOut",
    });
    return controls.stop;
  }, [value, motionVal]);

  return <motion.span>{display}</motion.span>;
}

// ---------------------------------------------------------------------------
// Placeholder sparkline data
// ---------------------------------------------------------------------------

const SPARK_CUSTOMERS = [12, 15, 14, 18, 22, 25, 23, 28, 30, 32, 35, 38];
const SPARK_REVENUE = [120, 340, 280, 510, 420, 680, 720, 890, 950, 1100, 1050, 1200];

// ---------------------------------------------------------------------------
// Connect Store — inline Shopify OAuth
// ---------------------------------------------------------------------------

function ConnectStorePrompt() {
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);

  const handleConnect = () => {
    const d = domain.trim();
    if (!d) {
      setError("Please enter your shop domain");
      return;
    }
    const fullDomain = d.includes(".myshopify.com") ? d : `${d}.myshopify.com`;
    if (!/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(fullDomain)) {
      setError("Invalid domain format");
      return;
    }
    setConnecting(true);
    window.location.href = `/api/shopify/auth?shop=${fullDomain}`;
  };

  return (
    <motion.div
      className="flex items-center justify-center min-h-[60vh]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="text-center max-w-md w-full">
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-success)]/10 flex items-center justify-center mx-auto mb-5">
          <Store className="w-8 h-8 text-[var(--color-success)]" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground font-serif mb-2">Connect Your Store</h1>
        <p className="text-sm text-muted-foreground font-sans mb-6 leading-relaxed">
          Connect your Shopify store to get started. Allo will analyze your brand,
          segment your customers, and set up AI-powered retention.
        </p>
        <div className="max-w-sm mx-auto space-y-3">
          <div className="flex items-center">
            <input
              type="text"
              placeholder="your-store"
              value={domain}
              onChange={(e) => { setDomain(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              className="flex-1 px-4 py-2.5 text-sm rounded-l-lg border border-border bg-white/80 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
            <span className="px-3 py-2.5 text-sm text-muted-foreground bg-muted border border-l-0 border-border rounded-r-lg">
              .myshopify.com
            </span>
          </div>
          {error && <p className="text-xs text-[var(--color-urgent)]">{error}</p>}
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full flex items-center justify-center gap-2 px-6 py-2.5 bg-foreground text-background text-sm font-medium rounded-xl hover:opacity-90 transition-all disabled:opacity-50"
          >
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
            {connecting ? "Connecting..." : "Connect Store"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Segment colors for health bar
// ---------------------------------------------------------------------------

const SEGMENT_COLORS: Record<string, string> = {
  Champions: "var(--color-success)",
  "Loyal Customers": "var(--color-warning)",
  "Potential Loyalists": "var(--color-accent)",
  "New Customers": "#8A7D6B",
  "At Risk": "var(--color-urgent)",
  Hibernating: "#999",
  Lost: "#888",
};

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { data: stats } = trpc.dashboard.stats.useQuery();
  const { data: stores, isLoading: storesLoading } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";
  const store = stores?.[0];
  const onboardingDone = !!store?.onboardingCompletedAt;
  const [justCompletedOnboarding, setJustCompletedOnboarding] = useState(false);

  const { data: latestBriefing } = (trpc as any).briefings.latest.useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone },
  ) as { data: any | undefined };

  const { data: missionControl } = (trpc as any).briefings.missionControl.useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone, refetchInterval: 60000 },
  ) as { data: any | undefined };

  const { data: programs } = (trpc.automations.list as any).useQuery(
    storeId ? { storeId } : undefined,
    { enabled: !!storeId && onboardingDone },
  ) as { data: { id: string; name: string; description: string | null; programType: string; status: string }[] | undefined };

  const { data: tokenUsage } = (trpc.dashboard.tokenUsage as any).useQuery(undefined, {
    enabled: onboardingDone,
  }) as {
    data: {
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCalls: number;
      totalCost: number;
    } | undefined;
  };

  const { data: segmentsList } = trpc.segments.list.useQuery(undefined, { enabled: onboardingDone });

  const { data: customerStats } = (trpc.customers.stats as any).useQuery(undefined, {
    enabled: onboardingDone,
  }) as {
    data: { totalCustomers: number; acceptsMarketing: number; marketingRate: number; totalRevenue: number; avgOrderValue: number } | undefined;
  };

  const { data: segmentDist } = (trpc.segments.distribution as any).useQuery(undefined, {
    enabled: onboardingDone,
  }) as {
    data: { segment: string; customerCount: number; totalRevenue: number; avgOrderValue: number }[] | undefined;
  };

  const { data: baselineData } = (trpc as any).briefings.baseline.useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone }
  ) as { data: { metrics?: { totalCustomers?: number; totalRevenue?: number; avgOrderValue?: number }; capturedAt?: string } | undefined };

  const { data: brandProfile } = (trpc.ai.brandProfile as any).useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone },
  ) as { data: any | undefined };

  const { data: brandStatus } = (
    trpc.ai.brandProfileStatus as any
  ).useQuery({ storeId }, { enabled: !!storeId && onboardingDone }) as {
    data: { exists: boolean } | undefined;
  };

  const utils = trpc.useUtils();

  const handleOnboardingComplete = () => {
    setJustCompletedOnboarding(true);
    utils.stores.list.invalidate();
  };

  // Computed values
  const mc = missionControl;
  const briefingContent = latestBriefing?.content as any;
  const hasSyncedData = (stats?.totalCustomers ?? 0) > 0;
  const hasBrand = brandStatus?.exists ?? false;
  const automationCount = programs?.filter((p) => p.status !== "recommended").length ?? 0;
  const readyCampaigns = programs?.filter((p) => p.status === "ready" || p.status === "active").length ?? 0;

  const aiCost = tokenUsage?.totalCost ?? 0;
  const aiCalls = tokenUsage?.totalCalls ?? 0;
  const estimatedSavings = automationCount * 100 + (hasBrand ? 200 : 0) + (hasSyncedData ? 150 : 0);

  // Attention items
  const attentionItems: { level: "urgent" | "moderate" | "positive"; text: string; detail: string; action: string; href: string }[] = [];
  if (segmentDist) {
    const hibernating = segmentDist.find((s) => s.segment === "Lost" || s.segment === "Hibernating");
    if (hibernating && hibernating.customerCount > 0) {
      attentionItems.push({
        level: "urgent",
        text: `${hibernating.customerCount} hibernating customers`,
        detail: `${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(hibernating.totalRevenue)} in past revenue at risk`,
        action: "Launch Win-Back",
        href: "/automations",
      });
    }
  }
  if (customerStats && customerStats.marketingRate === 0) {
    attentionItems.push({
      level: "moderate",
      text: "Marketing opt-in rate is 0%",
      detail: "Set up a lead capture form to start collecting opt-ins",
      action: "Create Form",
      href: "/forms",
    });
  }
  if (programs) {
    const readyNotLive = programs.filter((p) => p.status === "ready");
    if (readyNotLive.length > 0) {
      attentionItems.push({
        level: "positive",
        text: `${readyNotLive.length} automation${readyNotLive.length > 1 ? "s" : ""} ready to go live`,
        detail: readyNotLive.map((p) => p.name).join(", "),
        action: "Review & Activate",
        href: "/automations",
      });
    }
  }

  // Build briefing narrative
  const buildNarrative = () => {
    if (!mc && !briefingContent) return null;
    const parts: string[] = [];
    const now = new Date();
    const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
    const monthDay = now.toLocaleDateString("en-US", { month: "long", day: "numeric" });

    parts.push(`${dayName}, ${monthDay}`);

    // First load after onboarding — recently activated
    const activatedAt = store?.activatedAt ? new Date(store.activatedAt) : null;
    const isRecentlyActivated = activatedAt && (Date.now() - activatedAt.getTime()) < 5 * 60 * 1000;
    if (isRecentlyActivated) {
      parts.push("Welcome! Allo has set up your retention system. Check the AI panel to see what was created and what needs your review.");
      return parts;
    }

    if (briefingContent?.summary) {
      parts.push(briefingContent.summary);
    } else if (mc) {
      const revenue = mc.sinceLastVisit?.revenue ?? 0;
      const orders = mc.sinceLastVisit?.orders ?? 0;
      if (revenue > 0) {
        const aov = orders > 0 ? Math.round(revenue / orders) : 0;
        parts.push(`${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(revenue)} in revenue across ${orders} orders${aov > 0 ? `, with an average order value of ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(aov)}` : ""}.`);
      }
    }

    if (segmentDist) {
      const hibernating = segmentDist.find((s) => s.segment === "Hibernating" || s.segment === "Lost");
      const totalCust = segmentDist.reduce((sum, s) => sum + s.customerCount, 0);
      if (hibernating && totalCust > 0) {
        const pct = Math.round((hibernating.customerCount / totalCust) * 100);
        if (pct > 20) {
          parts.push(`${hibernating.customerCount} customers (${pct}% of your base) are hibernating. This is your biggest opportunity \u2014 a win-back campaign targeting these customers could recover significant revenue.`);
        }
      }
    }

    if (automationCount > 0) {
      const active = programs?.filter((p) => p.status === "active").length ?? 0;
      const ready = programs?.filter((p) => p.status === "ready").length ?? 0;
      parts.push(`Allo has set up your retention system. **${automationCount} automations** created — ${active} running on autopilot${ready > 0 ? `, ${ready} ready for your review` : ""}.${aiCost > 0 ? ` AI cost so far: $${aiCost < 0.01 ? "<0.01" : aiCost.toFixed(2)}.` : ""}`);
    }

    return parts;
  };

  // --- Loading ---
  if (storesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // --- State 1: No store ---
  if (!storeId) {
    return <ConnectStorePrompt />;
  }

  // --- State 2: Onboarding not done ---
  if (!onboardingDone && !justCompletedOnboarding) {
    return <OnboardingWizard storeId={storeId} onComplete={handleOnboardingComplete} />;
  }

  const narrative = buildNarrative();

  // --- State 3: Mission Control ---
  return (
    <motion.div
      className="space-y-8 max-w-4xl"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* 1. MORNING BRIEFING — Hero Section */}
      <motion.div
        variants={itemVariants}
        className="glass-card-static rounded-2xl p-8 md:p-10 border-l-[3px] border-l-[var(--color-accent)]"
        style={{
          background: "linear-gradient(135deg, var(--glass-bg) 0%, rgba(253, 245, 238, 0.8) 100%)",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-[var(--color-accent)]" />
          <span className="section-header text-[14px] text-foreground">
            Your Daily Briefing
          </span>
        </div>
        {narrative && narrative.length > 0 ? (
          <div className="space-y-4">
            <h2 className="text-[18px] font-serif font-semibold text-foreground leading-tight">
              {narrative[0]}
            </h2>
            {narrative.slice(1).map((para, i) => (
              <p key={i} className="text-[16px] leading-[1.7] text-foreground/80 font-sans">
                {para}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-[16px] leading-[1.7] text-foreground/80 font-sans">
            Welcome! As your store data syncs, Allo will generate personalized briefings with insights and recommendations.
          </p>
        )}

        {/* Priorities */}
        {attentionItems.length > 0 && (
          <div className="mt-6 pt-6 border-t border-black/[0.06]">
            <p className="text-[13px] font-serif font-semibold text-foreground mb-3">Your priorities today:</p>
            <div className="space-y-2">
              {attentionItems.slice(0, 3).map((item, i) => (
                <Link
                  key={i}
                  href={item.href}
                  className="flex items-center gap-3 group"
                >
                  <span className="text-[14px] font-sans text-foreground/70 group-hover:text-foreground transition-colors">
                    {i + 1}.{" "}
                    <span className={
                      item.level === "urgent" ? "text-[var(--color-urgent)]" :
                      item.level === "moderate" ? "text-[var(--color-warning)]" :
                      "text-[var(--color-success)]"
                    }>
                      {item.text}
                    </span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* 2. PENDING ACTIONS — Inline Action Cards */}
      {(mc?.needsAttention?.pendingActions ?? 0) > 0 && (
        <motion.div variants={itemVariants}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-header text-[15px] text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-[var(--color-warning)]" />
              Pending Actions
            </h2>
            <Link href="/actions" className="text-[12px] font-mono text-[var(--color-accent)] hover:opacity-80 transition-opacity">
              View all <ChevronRight className="w-3 h-3 inline" />
            </Link>
          </div>
          <div className="space-y-3">
            {attentionItems.slice(0, 3).map((item, i) => (
              <motion.div
                key={i}
                variants={itemVariants}
                className="glass-card-static rounded-xl p-5 flex items-start gap-4"
                style={{
                  borderLeft: `3px solid ${
                    item.level === "urgent" ? "var(--color-urgent)" :
                    item.level === "moderate" ? "var(--color-warning)" :
                    "var(--color-success)"
                  }`,
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-mono font-medium text-foreground">{item.text}</p>
                  <p className="text-[12px] text-muted-foreground font-sans mt-1">{item.detail}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link
                    href={item.href}
                    className="px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-[12px] font-mono font-medium hover:opacity-90 transition-opacity"
                  >
                    {item.action}
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* 3. WHAT ALLO DID + AUTOMATIONS — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-5">
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-header text-[14px] text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--color-warning)]" />
              What Allo Did
            </h2>
            <span className="text-[11px] font-mono text-muted-foreground">Last 24 hours</span>
          </div>
          <div className="space-y-0">
            {automationCount > 0 && (
              <div className="flex items-start gap-2 py-3 border-b border-black/[0.04]">
                <Check className="w-3.5 h-3.5 text-[var(--color-success)] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[13px] font-mono text-foreground">Generated {automationCount} automations</p>
                  <p className="text-[11px] text-muted-foreground font-sans mt-0.5">
                    {programs?.filter((p) => p.status !== "recommended").map((p) => p.name).slice(0, 3).join(", ")}
                    {automationCount > 3 ? `, +${automationCount - 3} more` : ""}
                  </p>
                </div>
              </div>
            )}
            {hasBrand && brandProfile && (
              <div className="flex items-start gap-2 py-3 border-b border-black/[0.04]">
                <Check className="w-3.5 h-3.5 text-[var(--color-success)] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[13px] font-mono text-foreground">Analyzed brand voice for {brandProfile?.brandName ?? "your store"}</p>
                  <p className="text-[11px] text-muted-foreground font-sans mt-0.5">
                    Tone: {Object.keys(brandProfile?.toneAttributes ?? {}).slice(0, 3).join(" \u00b7 ")}
                  </p>
                </div>
              </div>
            )}
            {hasSyncedData && (
              <div className="flex items-start gap-2 py-3 border-b border-black/[0.04]">
                <Check className="w-3.5 h-3.5 text-[var(--color-success)] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[13px] font-mono text-foreground">Segmented {stats?.totalCustomers ?? 0} customers into {segmentDist?.length ?? 0} groups</p>
                </div>
              </div>
            )}
            {hasSyncedData && (
              <div className="flex items-start gap-2 py-3">
                <Check className="w-3.5 h-3.5 text-[var(--color-success)] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[13px] font-mono text-foreground">Calculated RFM scores for {stats?.totalCustomers ?? 0} customers</p>
                </div>
              </div>
            )}
          </div>
          {tokenUsage && tokenUsage.totalCalls > 0 && (
            <div className="mt-4 pt-4 border-t border-black/[0.06] flex items-center gap-3">
              <span className="text-[12px] font-mono text-muted-foreground">
                {aiCalls} actions &middot; ${aiCost < 0.01 ? "<0.01" : aiCost.toFixed(2)} AI cost
              </span>
              {estimatedSavings > 0 && (
                <span className="text-[12px] font-mono text-[var(--color-success)] font-semibold">
                  &middot; ~${estimatedSavings.toLocaleString()} saved
                </span>
              )}
            </div>
          )}
        </motion.div>

        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-header text-[14px] text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-muted-foreground" />
              Automations
            </h2>
            <Link href="/automations" className="text-[11px] font-mono text-[var(--color-accent)] hover:opacity-80 transition-opacity">
              View all <ChevronRight className="w-3 h-3 inline" />
            </Link>
          </div>
          {programs && programs.length > 0 ? (
            <div className="space-y-0">
              {programs.map((p, i) => (
                <Link key={p.id} href="/automations" className={`flex items-center justify-between py-2.5 hover:bg-white/10 -mx-2 px-2 rounded-lg transition-colors ${i < programs.length - 1 ? "border-b border-black/[0.03]" : ""}`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      p.status === "active" ? "bg-[var(--color-success)]" :
                      p.status === "ready" ? "bg-[var(--color-warning)]" :
                      p.status === "generating" ? "bg-[var(--color-accent)] animate-pulse" :
                      p.status === "draft" ? "bg-[var(--color-accent)]" :
                      "border border-muted-foreground"
                    }`} />
                    <span className="text-[12px] font-mono text-foreground truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-mono text-muted-foreground capitalize">{p.status}</span>
                    {p.status === "ready" && <span className="text-[10px] font-mono text-[var(--color-accent)]">Go Live <ChevronRight className="w-2.5 h-2.5 inline" /></span>}
                  </div>
                </Link>
              ))}
              <div className="pt-3 mt-1 border-t border-black/[0.04]">
                <p className="text-[11px] font-mono text-muted-foreground">
                  {programs.filter((p) => p.status === "active").length} live
                  {" \u00b7 "}{programs.filter((p) => p.status === "ready").length} ready
                  {" \u00b7 "}{programs.filter((p) => p.status === "draft" || p.status === "generating").length} draft
                </p>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center">
              <p className="text-[12px] text-muted-foreground font-sans">Allo is setting up automations...</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* 4. CUSTOMER HEALTH */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <h2 className="section-header text-[14px] text-foreground mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          Customer Health
        </h2>
        {segmentDist && segmentDist.length > 0 ? (
          <>
            <div className="h-3 rounded-full overflow-hidden flex mb-3">
              {segmentDist.map((s) => {
                const totalCust = segmentDist.reduce((sum, seg) => sum + seg.customerCount, 0);
                const pct = totalCust > 0 ? (s.customerCount / totalCust) * 100 : 0;
                if (pct === 0) return null;
                return <div key={s.segment} style={{ width: `${pct}%`, backgroundColor: SEGMENT_COLORS[s.segment] ?? "#ccc" }} title={`${s.segment}: ${s.customerCount} (${Math.round(pct)}%)`} />;
              })}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-4">
              {segmentDist.filter((s) => s.customerCount > 0).map((s) => {
                const totalCust = segmentDist.reduce((sum, seg) => sum + seg.customerCount, 0);
                const pct = totalCust > 0 ? Math.round((s.customerCount / totalCust) * 100) : 0;
                return (
                  <div key={s.segment} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: SEGMENT_COLORS[s.segment] ?? "#ccc" }} />
                    <span className="text-[11px] font-mono text-foreground">{s.segment}</span>
                    <span className="text-[10px] text-muted-foreground">{s.customerCount} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
            {customerStats && (
              <div className="flex items-center gap-6 text-[11px] font-mono text-muted-foreground">
                <span>Marketing opt-in: <strong className="text-foreground">{customerStats.marketingRate.toFixed(0)}%</strong></span>
                <span>Avg order value: <strong className="text-foreground">${customerStats.avgOrderValue.toFixed(0)}</strong></span>
              </div>
            )}
            {(() => {
              const hibernating = segmentDist.find((s) => s.segment === "Lost" || s.segment === "Hibernating");
              const totalCust = segmentDist.reduce((sum, s) => sum + s.customerCount, 0);
              if (hibernating && totalCust > 0 && (hibernating.customerCount / totalCust) > 0.3) {
                const pct = Math.round((hibernating.customerCount / totalCust) * 100);
                return (
                  <div className="flex items-start gap-2 p-3 mt-3 bg-white/20 rounded-lg border border-white/15">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--color-warning)] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[12px] font-sans text-foreground italic">{pct}% of your base is dormant. A win-back campaign could recover estimated revenue.</p>
                      <Link href="/automations" className="text-[11px] font-mono text-[var(--color-accent)] mt-1 inline-block">Launch Win-Back <ChevronRight className="w-2.5 h-2.5 inline" /></Link>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
          </>
        ) : (
          <p className="text-[12px] text-muted-foreground font-sans py-4">Run RFM analysis to see customer health distribution.</p>
        )}
      </motion.div>

      {/* 5. KPI CARDS — Compact row */}
      <motion.div variants={itemVariants}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Link href="/customers" className="glass-card p-4 group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">Customers</span>
              {(() => {
                const current = stats?.totalCustomers ?? 0;
                const baseline = baselineData?.metrics?.totalCustomers;
                if (baseline && baseline > 0) {
                  const pct = Math.round(((current - baseline) / baseline) * 100);
                  return (
                    <span className={pct >= 0 ? "trend-pill-up" : "trend-pill-down"}>
                      {pct >= 0 ? "+" : ""}{pct}%
                    </span>
                  );
                }
                return null;
              })()}
            </div>
            <div className="text-[24px] font-bold text-foreground font-mono leading-tight">
              <AnimatedNumber value={stats?.totalCustomers ?? 0} />
            </div>
            <div className="mt-1.5"><Sparkline data={SPARK_CUSTOMERS} /></div>
          </Link>

          <Link href="/segments" className="glass-card p-4 group">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">Segments</span>
            <div className="text-[24px] font-bold text-foreground font-mono leading-tight mt-1">
              <AnimatedNumber value={(segmentsList as any)?.length ?? 0} />
            </div>
            <p className="text-[10px] text-muted-foreground font-sans mt-1.5">active segments</p>
          </Link>

          <Link href="/campaigns" className="glass-card p-4 group">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">Campaigns</span>
            {readyCampaigns > 0 ? (
              <>
                <div className="text-[24px] font-bold text-foreground font-mono leading-tight mt-1">
                  <AnimatedNumber value={readyCampaigns} />
                </div>
                <p className="text-[10px] text-muted-foreground font-sans mt-1.5">ready to send</p>
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground font-mono mt-3">Generating...</p>
            )}
          </Link>

          <Link href="/analytics" className="glass-card p-4 group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">Revenue</span>
              {(() => {
                const current = stats?.revenueThisMonth ?? 0;
                const baseline = baselineData?.metrics?.totalRevenue;
                if (baseline && baseline > 0) {
                  const pct = Math.round(((current - baseline) / baseline) * 100);
                  return (
                    <span className={pct >= 0 ? "trend-pill-up" : "trend-pill-down"}>
                      {pct >= 0 ? "+" : ""}{pct}%
                    </span>
                  );
                }
                return null;
              })()}
            </div>
            <div className="text-[24px] font-bold text-[var(--color-success)] font-mono leading-tight">
              <AnimatedNumber value={stats?.revenueThisMonth ?? 0} prefix="$" />
            </div>
            <div className="mt-1.5"><Sparkline data={SPARK_REVENUE} /></div>
          </Link>
        </div>
      </motion.div>
    </motion.div>
  );
}
