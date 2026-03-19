"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Brain,
  Store,
  Loader2,
  ChevronRight,
  ShieldAlert,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  TrendingUp,
  AlertTriangle,
  Info,
  Activity,
  Clock,
  X,
} from "lucide-react";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import { Sparkline } from "@/components/ui/Sparkline";
import { PulseDot } from "@/components/ui/PulseDot";
import { WhyButton } from "@/components/ui/WhyButton";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useUser } from "@clerk/nextjs";
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
// Helper: extract sparkline values from time-series points
// ---------------------------------------------------------------------------
function toSparkValues(points?: { date: string; value: number }[]): number[] {
  if (!points || points.length < 2) return [];
  return points.map((p) => p.value);
}

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
              className="flex-1 px-4 py-2.5 text-sm rounded-l-lg border border-border bg-white/80 dark:bg-[rgba(40,36,30,0.8)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[var(--color-accent)] transition-colors"
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

// Concept-a style segment styling for animated bars
const SEGMENT_STYLES: Record<string, { dot: string; color: string }> = {
  Champions: { dot: "bg-[#B8963E]", color: "#B8963E" },
  "Loyal Customers": { dot: "bg-[#6B7A2F]", color: "#6B7A2F" },
  "Potential Loyalists": { dot: "bg-cyan-500", color: "#06b6d4" },
  "New Customers": { dot: "bg-[#8A7D6B]", color: "#8A7D6B" },
  "At Risk": { dot: "bg-[#c4704a]", color: "#c4704a" },
  Hibernating: { dot: "bg-gray-400", color: "#9ca3af" },
  Lost: { dot: "bg-gray-400", color: "#9ca3af" },
};

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// ---------------------------------------------------------------------------
// Helper: relative time formatting
// ---------------------------------------------------------------------------
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0 || diffMs < 60_000) return "Just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ---------------------------------------------------------------------------
// Helper: humanize action type
// ---------------------------------------------------------------------------
function formatActionType(type: string): string {
  const map: Record<string, string> = {
    campaign_send: "Preparing campaign",
    campaign_queued: "Campaign queued",
    automation_draft: "Drafted automation",
    content_generation: "Generated content",
    segment_refresh: "Refreshing segments",
  };
  if (map[type]) return map[type];
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DashboardPage() {
  const { user } = useUser();
  const rawFirst = user?.firstName || "there";
  const firstName = rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1);
  const greeting = getGreeting();
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
    { enabled: !!storeId && onboardingDone, refetchInterval: 15000 },
  ) as { data: { id: string; name: string; description: string | null; programType: string; status: string }[] | undefined };

  const { data: tokenUsage } = (trpc.dashboard.tokenUsage as any).useQuery(undefined, {
    enabled: onboardingDone, refetchInterval: 15000,
  }) as {
    data: {
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCalls: number;
      totalCost: number;
    } | undefined;
  };

  trpc.segments.list.useQuery(undefined, { enabled: onboardingDone });

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

  const { data: recentActions } = (trpc.autonomy.listActions as any).useQuery(
    { storeId, limit: 10 },
    { enabled: !!storeId && onboardingDone, refetchInterval: 5000 },
  ) as { data: { actions: { id: string; type: string; category: string | null; status: string; reasoning: string | null; createdAt: string; confidenceScore: number | null }[]; total: number } | undefined };

  // Time-series data for sparklines
  const { data: revenueSeries } = trpc.dashboard.timeSeries.useQuery(
    { metric: "revenue", days: "30" },
    { enabled: onboardingDone },
  );
  const { data: customerSeries } = trpc.dashboard.timeSeries.useQuery(
    { metric: "customers", days: "30" },
    { enabled: onboardingDone },
  );
  const { data: orderSeries } = trpc.dashboard.timeSeries.useQuery(
    { metric: "orders", days: "30" },
    { enabled: onboardingDone },
  );

  // ROI data — real AI-attributed revenue
  const { data: roiData } = (trpc.analytics.roi as any).useQuery(
    { storeId, days: 30 },
    { enabled: !!storeId && onboardingDone },
  ) as { data: { aiTokenCost: number; aiAttributedRevenue: number; roi: number; campaignsSent: number; automationsSent: number } | undefined };

  // Revenue Attribution breakdown
  const { data: revenueAttribution } = (trpc.dashboard.revenueAttribution as any).useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone, refetchInterval: 60000 },
  ) as {
    data: {
      today: { revenue: number; orders: number };
      week: { revenue: number; orders: number };
      month: { revenue: number; orders: number };
      total: { revenue: number; orders: number };
    } | undefined;
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

  const aiCost = tokenUsage?.totalCost ?? 0;
  const aiCalls = tokenUsage?.totalCalls ?? 0;
  const aiAttributedRevenue = roiData?.aiAttributedRevenue ?? 0;

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

  // Build smart subtitle for greeting
  const greetingSubtitle = (() => {
    const urgentItem = attentionItems.find((a) => a.level === "urgent");
    if (urgentItem) return urgentItem.text + " — " + urgentItem.detail;
    if (automationCount > 0) {
      const active = programs?.filter((p) => p.status === "active").length ?? 0;
      return `Your agent handled ${automationCount} automations${active > 0 ? ` — ${active} running on autopilot` : ""}${aiAttributedRevenue > 0 ? ` and drove $${aiAttributedRevenue.toLocaleString()} in attributed revenue` : ""}.`;
    }
    if (hasSyncedData) return `Allo is monitoring ${stats?.totalCustomers?.toLocaleString() ?? 0} customers across ${segmentDist?.length ?? 0} segments.`;
    return "Your retention system is getting set up. Check back soon for insights.";
  })();

  const now = new Date();
  const briefingDate = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // --- State 3: Mission Control ---
  return (
    <motion.div
      className="space-y-8 w-full"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* 1. GREETING — concept-a style */}
      <motion.div variants={itemVariants}>
        <h1
          className="text-[28px] font-bold tracking-[-0.03em] text-foreground"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {greeting}, {firstName}
        </h1>
        <p className="text-[14px] text-muted-foreground mt-1 leading-relaxed">
          {greetingSubtitle}
        </p>
      </motion.div>

      {/* 2. KPI CARDS — concept-a style */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(() => {
          // Compute real deltas
          const revenueSparkVals = toSparkValues(revenueSeries?.points);
          const customerSparkVals = toSparkValues(customerSeries?.points);
          const orderSparkVals = toSparkValues(orderSeries?.points);

          // Revenue delta: compare first half vs second half of 30-day series
          const revenueDelta = (() => {
            if (revenueSparkVals.length < 4) return { change: "0%", up: false, neutral: true };
            const mid = Math.floor(revenueSparkVals.length / 2);
            const firstHalf = revenueSparkVals.slice(0, mid).reduce((a, b) => a + b, 0);
            const secondHalf = revenueSparkVals.slice(mid).reduce((a, b) => a + b, 0);
            if (firstHalf === 0 && secondHalf === 0) return { change: "0%", up: false, neutral: true };
            if (firstHalf === 0) return { change: "+100%", up: true, neutral: false };
            const pct = Math.round(((secondHalf - firstHalf) / firstHalf) * 100);
            return { change: pct > 0 ? `+${pct}%` : `${pct}%`, up: pct > 0, neutral: pct === 0 };
          })();

          const customerDelta = (() => {
            const baseline = baselineData?.metrics?.totalCustomers;
            if (!baseline || baseline === 0) return { change: "0%", up: false, neutral: true };
            const current = stats?.totalCustomers ?? 0;
            const pct = Math.round(((current - baseline) / baseline) * 100);
            return { change: pct > 0 ? `+${pct}%` : `${pct}%`, up: pct > 0, neutral: pct === 0 };
          })();

          // Use revenue attribution breakdown for the Allo Revenue card
          const alloRevenue = revenueAttribution?.month?.revenue ?? aiAttributedRevenue;
          const alloRevenueToday = revenueAttribution?.today?.revenue ?? 0;
          const alloRevenueWeek = revenueAttribution?.week?.revenue ?? 0;

          return [
            {
              label: "Allo Revenue",
              value: Math.round(alloRevenue),
              prefix: "$",
              ...revenueDelta,
              spark: revenueSparkVals,
              color: "#B8963E",
              href: "/analytics",
              subtitle: alloRevenueToday > 0 ? `$${alloRevenueToday.toLocaleString()} today` : alloRevenueWeek > 0 ? `$${alloRevenueWeek.toLocaleString()} this week` : undefined,
            },
            {
              label: "Customers",
              value: stats?.totalCustomers ?? 0,
              prefix: "",
              ...customerDelta,
              spark: customerSparkVals,
              color: "#6B7A2F",
              href: "/customers",
            },
            {
              label: "At Risk",
              value: segmentDist?.find((s) => s.segment === "At Risk" || s.segment === "Hibernating")?.customerCount ?? 0,
              prefix: "",
              change: "0%",
              up: false,
              neutral: true,
              spark: [] as number[],
              color: "#c4704a",
              href: "/segments",
            },
            {
              label: "Agent Actions",
              value: aiCalls,
              prefix: "",
              change: "0%",
              up: false,
              neutral: true,
              spark: orderSparkVals,
              color: "#7c3aed",
              href: "/actions",
            },
          ];
        })().map((kpi, i) => (
          <Link
            key={i}
            href={kpi.href}
            className="group relative rounded-2xl p-5 border border-black/5 dark:border-[rgba(200,180,150,0.12)] transition-all duration-300 hover:-translate-y-0.5 cursor-pointer bg-white/60 dark:bg-[rgba(40,36,30,0.7)]"
            style={{ backdropFilter: "blur(20px)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="text-[10px] font-mono uppercase tracking-[0.1em] text-[#9ca3af] dark:text-[#6B6358]"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {kpi.label}
                </span>
                {storeId && kpi.value > 0 && (
                  <WhyButton
                    context={`${kpi.label}: ${kpi.prefix}${kpi.value.toLocaleString()} (${kpi.change} trend). Why this number and trend?`}
                    storeId={storeId}
                  />
                )}
              </span>
              <Sparkline data={kpi.spark} color={kpi.color} />
            </div>
            <div className="flex items-end gap-3">
              <AnimatedCounter
                value={kpi.value}
                prefix={kpi.prefix || ""}
                className="text-[28px] font-bold tracking-[-0.03em] tabular-nums text-foreground"
                duration={1.2}
              />
              <span
                className={`inline-flex items-center gap-0.5 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full mb-1 ${
                  kpi.neutral
                    ? "bg-gray-500/10 text-gray-400 dark:bg-[rgba(200,180,150,0.1)] dark:text-[#6B6358]"
                    : kpi.up
                      ? "bg-[#6B7A2F]/10 text-[#6B7A2F]"
                      : "bg-[#c4704a]/10 text-[#c4704a]"
                }`}
              >
                {kpi.neutral ? (
                  <Minus className="w-3 h-3" />
                ) : kpi.up ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {kpi.change}
              </span>
            </div>
            {(kpi as any).subtitle && (
              <p className="text-[10px] font-mono text-muted-foreground mt-1">{(kpi as any).subtitle}</p>
            )}
          </Link>
        ))}
      </motion.div>

      {/* 3. TWO-COLUMN LAYOUT — concept-a style */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT COLUMN — 3/5 */}
        <div className="lg:col-span-3 space-y-6">
          {/* Daily Briefing — single card with inline feed */}
          <motion.div
            variants={itemVariants}
            className="rounded-2xl border border-black/5 dark:border-[rgba(200,180,150,0.12)] p-6 bg-white/60 dark:bg-[rgba(40,36,30,0.7)]"
            style={{ backdropFilter: "blur(20px)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px] font-mono uppercase tracking-[0.12em] font-bold text-[#9ca3af] dark:text-[#6B6358]"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  Daily Briefing
                </span>
                <span className="text-[10px] font-mono text-[#d1d5db] dark:text-[#6B6358]">{briefingDate}</span>
              </div>
            </div>

            <div className="space-y-0">
              {/* Priority action items */}
              {attentionItems.map((item, i) => {
                const color = item.level === "urgent" ? "#c4704a" : item.level === "moderate" ? "#B8963E" : "#6B7A2F";
                const Icon = item.level === "urgent" ? ShieldAlert : item.level === "moderate" ? AlertTriangle : CheckCircle;
                return (
                  <div
                    key={`priority-${i}`}
                    className={`flex items-start gap-3 py-3.5 ${i < attentionItems.length - 1 || (narrative && narrative.length > 1) ? "border-b border-black/[0.04] dark:border-[rgba(200,180,150,0.08)]" : ""}`}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: `${color}15` }}
                    >
                      <Icon className="w-3.5 h-3.5" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-foreground">{item.text}</span>
                        {storeId && (
                          <WhyButton
                            context={`${item.text}. ${item.detail}`}
                            storeId={storeId}
                          />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-[#A09888] mt-0.5">{item.detail}</p>
                    </div>
                    <Link
                      href={item.href}
                      className="text-[10px] font-mono font-semibold px-3 py-1.5 rounded-lg bg-[#2c2418] text-[#faf8f5] hover:bg-[#2c2418]/90 dark:bg-[#E8E2D8] dark:text-[#1A1815] dark:hover:bg-[#E8E2D8]/90 transition-colors flex-shrink-0 mt-1"
                    >
                      {item.action}
                    </Link>
                  </div>
                );
              })}

              {/* Narrative insights */}
              {narrative && narrative.length > 1 && narrative.slice(1).map((para, i) => {
                const isChurn = /hibernat|churn|at.risk|dormant|win.back/i.test(para);
                const isSuccess = /automation|set up|running|active|generated/i.test(para);
                const Icon = isChurn ? ShieldAlert : isSuccess ? TrendingUp : Brain;
                const iconColor = isChurn ? "#c4704a" : isSuccess ? "#6B7A2F" : "#B8963E";
                return (
                  <div
                    key={`narrative-${i}`}
                    className={`flex items-start gap-3 py-3.5 ${i < (narrative.length - 2) ? "border-b border-black/[0.04] dark:border-[rgba(200,180,150,0.08)]" : ""}`}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: `${iconColor}12` }}
                    >
                      <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
                    </div>
                    <p className="text-[12px] text-foreground/80 leading-relaxed flex-1">{para}</p>
                  </div>
                );
              })}

              {/* Briefing sections: Agent Activity + Revenue Attributed */}
              {briefingContent?.sections?.filter((s: any) => s.heading === "Agent Activity (Overnight)" || s.heading === "Revenue Attributed").map((section: any, si: number) => {
                const isRevenue = section.heading === "Revenue Attributed";
                const sectionColor = isRevenue ? "#B8963E" : "#7c3aed";
                const SectionIcon = isRevenue ? TrendingUp : Activity;
                return (
                  <div key={`briefing-section-${si}`} className="border-t border-black/[0.04] dark:border-[rgba(200,180,150,0.08)] pt-3 mt-2">
                    <div className="flex items-center gap-2 mb-2">
                      <SectionIcon className="w-3.5 h-3.5" style={{ color: sectionColor }} />
                      <span className="text-[10px] font-mono uppercase tracking-[0.1em] font-bold" style={{ color: sectionColor }}>
                        {section.heading}
                      </span>
                    </div>
                    {section.items.map((item: any, ii: number) => (
                      <div key={`bs-${si}-${ii}`} className="flex items-start gap-2 py-1.5">
                        <span className="text-[12px] text-foreground/80 leading-relaxed flex-1">{item.text}</span>
                        {item.metric?.value && (
                          <span className="text-[11px] font-mono font-semibold text-foreground flex-shrink-0">{item.metric.value}</span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Revenue Attribution KPI — inline if no briefing sections */}
              {revenueAttribution && revenueAttribution.month.revenue > 0 && !briefingContent?.sections?.some((s: any) => s.heading === "Revenue Attributed") && (
                <div className="border-t border-black/[0.04] dark:border-[rgba(200,180,150,0.08)] pt-3 mt-2">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-3.5 h-3.5 text-[#B8963E]" />
                    <span className="text-[10px] font-mono uppercase tracking-[0.1em] font-bold text-[#B8963E]">
                      Allo Revenue
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground">
                    <span>Today: <strong className="text-foreground">${revenueAttribution.today.revenue.toLocaleString()}</strong></span>
                    <span>Week: <strong className="text-foreground">${revenueAttribution.week.revenue.toLocaleString()}</strong></span>
                    <span>Month: <strong className="text-foreground">${revenueAttribution.month.revenue.toLocaleString()}</strong></span>
                  </div>
                </div>
              )}

              {/* Fallback when no content */}
              {attentionItems.length === 0 && (!narrative || narrative.length <= 1) && (
                <div className="flex items-start gap-3 py-3.5">
                  <div className="w-7 h-7 rounded-full bg-[#B8963E]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Info className="w-3.5 h-3.5 text-[#B8963E]" />
                  </div>
                  <p className="text-[12px] text-foreground/80 leading-relaxed">
                    Welcome! As your store data syncs, Allo will generate personalized briefings with insights and recommendations.
                  </p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Agent Activity */}
          {onboardingDone && hasSyncedData && (() => {
            // Build activity items from live action queue + static fallbacks
            const liveItems = (recentActions?.actions ?? []).map((action) => ({
              id: action.id,
              action: formatActionType(action.type),
              detail: action.reasoning ? (action.reasoning.length > 80 ? action.reasoning.slice(0, 80) + "..." : action.reasoning) : "",
              time: formatRelativeTime(action.createdAt),
              status: action.status as "pending" | "approved" | "executed" | "rejected",
            }));

            const fallbackItems: { id: string; action: string; detail: string; time: string; status: "approved" | "executed" }[] = [];
            if (liveItems.length < 3) {
              if (automationCount > 0) {
                fallbackItems.push({
                  id: "fallback-automations",
                  action: `Generated ${automationCount} automations`,
                  detail: (programs?.filter((p) => p.status !== "recommended").map((p) => p.name).slice(0, 2).join(", ") ?? "") + (automationCount > 2 ? ` +${automationCount - 2} more` : ""),
                  time: "Recently",
                  status: "executed",
                });
              }
              if (hasBrand) {
                fallbackItems.push({
                  id: "fallback-brand",
                  action: `Analyzed brand voice for ${brandProfile?.brandName ?? "your store"}`,
                  detail: `Tone: ${Object.keys(brandProfile?.toneAttributes ?? {}).slice(0, 3).join(" · ")}`,
                  time: "Recently",
                  status: "executed",
                });
              }
              if (hasSyncedData) {
                fallbackItems.push({
                  id: "fallback-segments",
                  action: `Segmented ${stats?.totalCustomers ?? 0} customers into ${segmentDist?.length ?? 0} groups`,
                  detail: "",
                  time: "Recently",
                  status: "executed",
                });
              }
            }

            const allItems = [...liveItems, ...fallbackItems].slice(0, 8);

            return (
              <motion.div
                variants={itemVariants}
                className="rounded-2xl border border-black/5 p-6"
                style={{ background: "rgba(255,255,255,0.6)", backdropFilter: "blur(20px)" }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-[#9ca3af] dark:text-[#6B6358]" />
                    <h2
                      className="text-[11px] font-mono uppercase tracking-[0.12em] font-bold text-[#9ca3af] dark:text-[#6B6358]"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      Agent Activity
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <PulseDot color="bg-[#6B7A2F]" />
                    <span className="text-[10px] font-mono text-muted-foreground">Live</span>
                  </div>
                </div>
                <div className="space-y-0">
                  {allItems.map((item, i) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.04 }}
                      className={`flex items-start gap-3 py-3 ${i < allItems.length - 1 ? "border-b border-black/[0.04] dark:border-[rgba(200,180,150,0.08)]" : ""}`}
                    >
                      {/* Status indicator */}
                      {item.status === "pending" ? (
                        <span className="mt-1 flex-shrink-0 w-4 h-4 flex items-center justify-center">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                        </span>
                      ) : item.status === "rejected" ? (
                        <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-[#6B7A2F] mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-foreground">{item.action}</div>
                        {item.detail && <span className="text-[11px] text-muted-foreground">{item.detail}</span>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Clock className="w-3 h-3 text-muted-foreground/40" />
                        <span className="text-[10px] font-mono text-muted-foreground/50">{item.time}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
                {tokenUsage && tokenUsage.totalCalls > 0 && (
                  <div className="mt-4 pt-3 border-t border-black/[0.06] dark:border-[rgba(200,180,150,0.08)] flex items-center justify-between">
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {aiCalls} actions &middot; ${aiCost < 0.01 ? "<0.01" : aiCost.toFixed(2)} AI cost
                    </span>
                    <Link
                      href="/actions"
                      className="text-[10px] font-mono text-[var(--color-accent)] hover:opacity-80 transition-opacity"
                    >
                      View all <ChevronRight className="w-2.5 h-2.5 inline" />
                    </Link>
                  </div>
                )}
                {(!tokenUsage || tokenUsage.totalCalls === 0) && (
                  <div className="mt-4 pt-3 border-t border-black/[0.06] dark:border-[rgba(200,180,150,0.08)] flex items-center justify-end">
                    <Link
                      href="/actions"
                      className="text-[10px] font-mono text-[var(--color-accent)] hover:opacity-80 transition-opacity"
                    >
                      View all <ChevronRight className="w-2.5 h-2.5 inline" />
                    </Link>
                  </div>
                )}
              </motion.div>
            );
          })()}
        </div>

        {/* RIGHT COLUMN — 2/5 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Automations */}
          <motion.div
            variants={itemVariants}
            className="rounded-2xl border border-black/5 dark:border-[rgba(200,180,150,0.12)] p-6 bg-white/60 dark:bg-[rgba(40,36,30,0.7)]"
            style={{ backdropFilter: "blur(20px)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-[11px] font-mono uppercase tracking-[0.12em] font-bold text-[#9ca3af] dark:text-[#6B6358]"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Automations
              </h2>
              <Link href="/automations" className="text-[10px] font-mono text-[var(--color-accent)] hover:opacity-80 transition-opacity">
                View all <ChevronRight className="w-2.5 h-2.5 inline" />
              </Link>
            </div>
            {programs && programs.length > 0 ? (
              <div className="space-y-0">
                {programs.map((p, i) => (
                  <Link
                    key={p.id}
                    href="/automations"
                    className={`flex items-center justify-between py-2.5 hover:bg-white/30 dark:hover:bg-[rgba(200,180,150,0.08)] -mx-2 px-2 rounded-lg transition-colors ${i < programs.length - 1 ? "border-b border-black/[0.03] dark:border-[rgba(200,180,150,0.06)]" : ""}`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {p.status === "active" ? (
                        <PulseDot color="bg-[var(--color-success)]" size="sm" />
                      ) : (
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          p.status === "ready" ? "bg-[var(--color-warning)]" :
                          p.status === "generating" ? "bg-[var(--color-accent)] animate-pulse" :
                          p.status === "draft" ? "bg-[var(--color-accent)]" :
                          "border border-muted-foreground"
                        }`} />
                      )}
                      <span className="text-[12px] font-mono text-foreground truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] font-mono text-muted-foreground capitalize">{p.status}</span>
                      {p.status === "ready" && (
                        <span className="text-[10px] font-mono text-[var(--color-accent)]">
                          Go Live <ChevronRight className="w-2.5 h-2.5 inline" />
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
                <div className="pt-3 mt-1 border-t border-black/[0.04] dark:border-[rgba(200,180,150,0.08)]">
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

          {/* Customer Segments — concept-a animated bars */}
          <motion.div
            variants={itemVariants}
            className="rounded-2xl border border-black/5 dark:border-[rgba(200,180,150,0.12)] p-6 bg-white/60 dark:bg-[rgba(40,36,30,0.7)]"
            style={{ backdropFilter: "blur(20px)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-[11px] font-mono uppercase tracking-[0.12em] font-bold text-[#9ca3af] dark:text-[#6B6358]"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Customer Segments
              </h2>
              <Link href="/segments" className="text-[10px] font-mono text-[var(--color-accent)] hover:opacity-80 transition-opacity">
                Details <ChevronRight className="w-2.5 h-2.5 inline" />
              </Link>
            </div>
            {segmentDist && segmentDist.length > 0 ? (
              <div className="space-y-3">
                {segmentDist.filter((s) => s.customerCount > 0).map((s, idx) => {
                  const totalCust = segmentDist.reduce((sum, seg) => sum + seg.customerCount, 0);
                  const pct = totalCust > 0 ? (s.customerCount / totalCust) * 100 : 0;
                  const style = SEGMENT_STYLES[s.segment] ?? { dot: "bg-gray-400", color: "#9ca3af" };
                  return (
                    <div key={s.segment} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                          <span className="text-[12px] font-mono text-foreground">{s.segment}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-muted-foreground">{s.customerCount}</span>
                          <span className="text-[10px] font-mono text-muted-foreground/60">{Math.round(pct)}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/[0.04] dark:bg-[rgba(200,180,150,0.1)] overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: style.color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, delay: 0.08 * idx, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  );
                })}
                {customerStats && (
                  <div className="pt-3 mt-1 border-t border-black/[0.04] dark:border-[rgba(200,180,150,0.08)] flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
                    <span>Opt-in: <strong className="text-foreground">{customerStats.marketingRate.toFixed(0)}%</strong></span>
                    <span>AOV: <strong className="text-foreground">${customerStats.avgOrderValue.toFixed(0)}</strong></span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground font-sans py-4">Run RFM analysis to see segments.</p>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
