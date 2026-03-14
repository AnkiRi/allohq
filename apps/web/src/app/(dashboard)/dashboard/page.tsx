"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  Brain,
  Zap,
  ShoppingBag,
  Store,
  Check,
  Sparkles,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  SlidersHorizontal,
} from "lucide-react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { ActivationProgress } from "@/components/dashboard/ActivationProgress";

// ---------------------------------------------------------------------------
// Motion variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

// ---------------------------------------------------------------------------
// Sparkline — inline SVG polyline
// ---------------------------------------------------------------------------

function Sparkline({
  data,
  color = "var(--olive)",
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
        <div className="w-16 h-16 rounded-2xl bg-[#6B7A2F]/10 flex items-center justify-center mx-auto mb-5">
          <Store className="w-8 h-8 text-[#6B7A2F]" />
        </div>
        <h1 className="text-2xl font-semibold text-[#2C2C2C] mb-2">Connect Your Store</h1>
        <p className="text-sm text-[#8B8074] mb-6 leading-relaxed">
          Connect your Shopify store to get started. Allo will analyze your brand,
          segment your customers, and set up AI-powered marketing automations.
        </p>
        <div className="max-w-sm mx-auto space-y-3">
          <div className="flex items-center">
            <input
              type="text"
              placeholder="your-store"
              value={domain}
              onChange={(e) => { setDomain(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              className="flex-1 px-4 py-2.5 text-sm rounded-l-lg border border-[#EDE7DB] bg-white/80 text-[#2C2C2C] placeholder:text-[#A09888] focus:outline-none focus:border-[#6B7A2F] transition-colors"
            />
            <span className="px-3 py-2.5 text-sm text-[#8B8074] bg-[#F5F0E8] border border-l-0 border-[#EDE7DB] rounded-r-lg">
              .myshopify.com
            </span>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full flex items-center justify-center gap-2 px-6 py-2.5 bg-[#2C2C2C] text-white text-sm font-medium rounded-lg hover:bg-[#1a1a1a] transition-colors disabled:opacity-50"
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
// Mission Control Section
// ---------------------------------------------------------------------------

function MissionControlSection({ storeId }: { storeId: string }) {
  const { data: missionControl, isLoading } = (trpc as any).briefings.missionControl.useQuery(
    { storeId },
    { enabled: !!storeId, refetchInterval: 60000 },
  ) as { data: any | undefined; isLoading: boolean };

  const { data: latestBriefing } = (trpc as any).briefings.latest.useQuery(
    { storeId },
    { enabled: !!storeId },
  ) as { data: any | undefined };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-skeleton h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!missionControl) return null;

  const mc = missionControl;
  const briefingContent = latestBriefing?.content as any;

  return (
    <div className="space-y-4">
      {briefingContent && (
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-[#6B7A2F]" />
            <span className="text-xs font-medium uppercase tracking-wide text-[#8B8074]">
              {briefingContent.title || "Morning Briefing"}
            </span>
          </div>
          <p className="text-sm text-[#5C5549]">{briefingContent.summary || "No briefing available yet."}</p>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[#8B8074] mb-3">Since you were last here</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#5C5549]">Revenue</span>
              <span className="text-sm font-semibold text-[#2C2C2C] font-mono">
                {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(mc.sinceLastVisit?.revenue ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#5C5549]">Orders</span>
              <span className="text-sm font-semibold text-[#2C2C2C] font-mono">{mc.sinceLastVisit?.orders ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#5C5549]">New customers</span>
              <span className="text-sm font-semibold text-[#2C2C2C] font-mono">{mc.sinceLastVisit?.newCustomers ?? 0}</span>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[#8B8074] mb-3">Needs your attention</h3>
          <div className="space-y-2">
            <Link href="/actions" className="flex items-center justify-between group">
              <span className="text-sm text-[#5C5549] group-hover:text-[#2C2C2C] transition-colors">Pending actions</span>
              <span className="text-sm font-semibold text-[#2C2C2C] font-mono">{mc.needsAttention?.pendingActions ?? 0}</span>
            </Link>
            {(mc.needsAttention?.urgentActions ?? 0) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Urgent</span>
                <span className="text-sm font-semibold text-red-600 font-mono">{mc.needsAttention.urgentActions}</span>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[#8B8074] mb-3">What Allo did</h3>
          {(mc.alloActivity?.campaignsSent ?? 0) > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#5C5549]">Campaigns sent</span>
                <span className="text-sm font-semibold text-[#2C2C2C] font-mono">{mc.alloActivity?.campaignsSent ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#5C5549]">Emails delivered</span>
                <span className="text-sm font-semibold text-[#2C2C2C] font-mono">{mc.alloActivity?.emailsSent ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#5C5549]">AI-attributed revenue</span>
                <span className="text-sm font-semibold text-[#6B7A2F] font-mono">
                  {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(mc.alloActivity?.revenue ?? 0)}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#6B7A2F]" />
                <span className="text-sm text-[#5C5549]">Analyzed your store data</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#6B7A2F]" />
                <span className="text-sm text-[#5C5549]">Segmented your customers</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[#B8963E]" />
                <span className="text-sm text-[#5C5549]">Setting up automations...</span>
              </div>
            </div>
          )}
        </motion.div>

        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[#8B8074] mb-3">Opportunities</h3>
          {(mc.opportunities?.length ?? 0) === 0 ? (
            <p className="text-sm text-[#8B8074]">No new opportunities detected</p>
          ) : (
            <div className="space-y-2">
              {(mc.opportunities as any[]).slice(0, 3).map((opp: any, i: number) => (
                <div key={i} className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-[#5C5549] line-clamp-1">{opp.description}</span>
                    <span className="text-xs text-[#8B8074]">{opp.customerCount} customers</span>
                  </div>
                  <span className="text-xs font-semibold text-[#6B7A2F] font-mono shrink-0 ml-2">
                    {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(opp.estimatedRevenue ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segment colors for health bar
// ---------------------------------------------------------------------------

const SEGMENT_COLORS: Record<string, string> = {
  Champions: "#6B7A2F",
  "Loyal Customers": "#B8963E",
  "Potential Loyalists": "#C4704A",
  "New Customers": "#8A7D6B",
  "At Risk": "#C44A4A",
  Hibernating: "#999",
  Lost: "#888",
};

// ---------------------------------------------------------------------------
// Dashboard Page — single hub for connect, onboard, and mission control
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  // All hooks called unconditionally (Rules of Hooks)
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery();
  const { data: stores, isLoading: storesLoading } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";
  const store = stores?.[0];
  const onboardingDone = !!store?.onboardingCompletedAt;
  const [justCompletedOnboarding, setJustCompletedOnboarding] = useState(false);

  const { data: brandProfile } = (trpc.ai.brandProfile as any).useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone },
  ) as { data: any | undefined };

  const { data: brandStatus } = (
    trpc.ai.brandProfileStatus as any
  ).useQuery({ storeId }, { enabled: !!storeId && onboardingDone }) as {
    data: { exists: boolean; creativeIntensity?: string } | undefined;
  };

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
      byModel: { model: string; inputTokens: number; outputTokens: number; calls: number; cost: number }[];
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

  const { data: aiSettings } = (trpc.ai.getSettings as any).useQuery(undefined, {
    enabled: onboardingDone,
  }) as {
    data: { defaultModel: string | null } | undefined;
  };

  const { data: aiModels } = trpc.ai.models.useQuery(undefined, { enabled: onboardingDone });

  const { data: pendingActionsCount } = (trpc.stores.activationStatus as any).useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone },
  ) as { data: any | undefined };

  const utils = trpc.useUtils();

  // When onboarding just completed, refresh store list to get updated onboardingCompletedAt
  const handleOnboardingComplete = () => {
    setJustCompletedOnboarding(true);
    utils.stores.list.invalidate();
  };

  // Computed values (safe to compute even without data)
  const hasSyncedData = (stats?.totalCustomers ?? 0) > 0;
  const hasBrand = brandStatus?.exists ?? false;
  const currentCreativeIntensity = (brandStatus as any)?.creativeIntensity ?? "balanced";
  const readyCampaigns = programs?.filter((p) => p.status === "ready" || p.status === "active").length ?? 0;
  const modelLabel = (aiModels as any)?.find((m: any) => m.id === aiSettings?.defaultModel)?.label ?? aiSettings?.defaultModel;
  const creativeLabel = currentCreativeIntensity === "text_heavy" ? "Text Heavy" : currentCreativeIntensity === "visual_heavy" ? "Visual Heavy" : "Balanced";

  const aiCost = tokenUsage?.totalCost ?? 0;
  const aiCalls = tokenUsage?.totalCalls ?? 0;
  const automationCount = programs?.filter((p) => p.status !== "recommended").length ?? 0;
  const estimatedSavings = automationCount * 100 + (hasBrand ? 200 : 0) + (hasSyncedData ? 150 : 0);

  const attentionItems: { level: "urgent" | "moderate" | "positive"; text: string; detail: string; action: string; href: string }[] = [];
  if (segmentDist) {
    const hibernating = segmentDist.find((s) => s.segment === "Lost" || s.segment === "Hibernating");
    if (hibernating && hibernating.customerCount > 0) {
      attentionItems.push({
        level: "urgent",
        text: `${hibernating.customerCount} customers are ${hibernating.segment} with $${Math.round(hibernating.totalRevenue).toLocaleString()} revenue`,
        detail: "These customers haven't purchased recently.",
        action: "Launch Win-Back Campaign \u2192",
        href: "/automations",
      });
    }
  }
  if (customerStats && customerStats.marketingRate === 0) {
    attentionItems.push({
      level: "moderate",
      text: "Marketing opt-in rate is 0%",
      detail: "No customers have opted into email/SMS marketing.",
      action: "Set Up Collection \u2192",
      href: "/settings",
    });
  }
  if (programs) {
    const readyNotLive = programs.filter((p) => p.status === "ready");
    if (readyNotLive.length > 0) {
      attentionItems.push({
        level: "positive",
        text: `${readyNotLive.length} automation${readyNotLive.length > 1 ? "s are" : " is"} ready but not live`,
        detail: readyNotLive.map((p) => p.name).join(", ") + (readyNotLive.length > 1 ? " are generated." : " is generated."),
        action: "Review & Go Live \u2192",
        href: "/automations",
      });
    }
  }

  // --- Loading ---
  if (storesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#8B8074]" />
      </div>
    );
  }

  // --- State 1: No store → inline connect ---
  if (!storeId) {
    return <ConnectStorePrompt />;
  }

  // --- State 2: Store exists, onboarding not done → show wizard ---
  if (!onboardingDone && !justCompletedOnboarding) {
    return <OnboardingWizard storeId={storeId} onComplete={handleOnboardingComplete} />;
  }

  // --- State 3: Onboarding complete → Mission Control ---
  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header with inline status pills */}
      <motion.div variants={itemVariants} className="glass-card-static px-8 py-5">
        <h1 className="section-header accent-bar-left text-[22px] text-foreground tracking-[-0.5px] mb-1">
          DASHBOARD
        </h1>
        <p className="text-[13px] text-muted-foreground font-sans pl-4">
          Your AI retention &amp; growth team
        </p>
        <div className="mt-3 flex items-center gap-2 pl-4 flex-wrap">
          <Link href="/integrations" className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-full bg-black/[0.04] text-[#6B7A2F] hover:bg-black/[0.07] transition-colors">
            <span className="w-1.5 h-1.5 rounded-full bg-[#6B7A2F]" /> Connected
          </Link>
          {aiSettings?.defaultModel && (
            <Link href="/settings" className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-full bg-black/[0.04] text-[#B8963E] hover:bg-black/[0.07] transition-colors">
              <Zap className="w-3 h-3" /> {modelLabel}
            </Link>
          )}
          <Link href="/settings" className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-full bg-black/[0.04] text-[#8A7D6B] hover:bg-black/[0.07] transition-colors">
            <SlidersHorizontal className="w-3 h-3" /> {creativeLabel}
          </Link>
          {hasBrand && (
            <Link href="/intelligence/brand" className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-full bg-black/[0.04] text-[#8A7D6B] hover:bg-black/[0.07] transition-colors">
              <Check className="w-3 h-3" /> Brand
            </Link>
          )}
        </div>
      </motion.div>

      {/* Activation Progress — shows after onboarding, above everything */}
      <ActivationProgress storeId={storeId} />

      {/* Mission Control */}
      <MissionControlSection storeId={storeId} />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div variants={itemVariants}>
          <Link href="/customers" className="block glass-card p-5 group">
            <div className="flex items-center justify-between mb-2">
              <div className="section-header text-[10px] text-muted-foreground">CUSTOMERS</div>
              {(() => {
                const current = stats?.totalCustomers ?? 0;
                const baseline = baselineData?.metrics?.totalCustomers;
                if (baseline && baseline > 0) {
                  const pct = Math.round(((current - baseline) / baseline) * 100);
                  const isUp = pct >= 0;
                  return (
                    <span className={isUp ? "trend-pill-up" : "trend-pill-down"}>
                      {isUp ? <TrendingUp className="w-3 h-3 inline mr-1" /> : <TrendingDown className="w-3 h-3 inline mr-1" />}
                      {isUp ? "+" : ""}{pct}%
                    </span>
                  );
                }
                return null;
              })()}
            </div>
            <div className="text-[32px] font-bold text-foreground font-mono tabular-nums leading-tight">
              <AnimatedNumber value={stats?.totalCustomers ?? 0} />
            </div>
            <div className="mt-2"><Sparkline data={SPARK_CUSTOMERS} color="var(--olive)" /></div>
            {baselineData?.metrics?.totalCustomers != null && (
              <div className="text-[9px] font-mono text-muted-foreground mt-1">
                Baseline: {baselineData.metrics.totalCustomers.toLocaleString()}
              </div>
            )}
          </Link>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Link href="/segments" className="block glass-card p-5 group">
            <div className="section-header text-[10px] text-muted-foreground mb-2">SEGMENTS</div>
            <div className="text-[32px] font-bold text-foreground font-mono tabular-nums leading-tight">
              <AnimatedNumber value={(segmentsList as any)?.length ?? 0} />
            </div>
            <p className="text-[11px] text-muted-foreground font-sans mt-2">active segments</p>
          </Link>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Link href="/campaigns" className="block glass-card p-5 group">
            <div className="section-header text-[10px] text-muted-foreground mb-2">CAMPAIGNS</div>
            {readyCampaigns > 0 ? (
              <>
                <div className="text-[32px] font-bold text-foreground font-mono tabular-nums leading-tight">
                  <AnimatedNumber value={readyCampaigns} />
                </div>
                <p className="text-[11px] text-muted-foreground font-sans mt-2">ready to send</p>
              </>
            ) : (pendingActionsCount?.context?.pendingActions ?? 0) > 0 ? (
              <p className="text-[13px] text-terracotta font-mono font-semibold mt-4">{pendingActionsCount.context.pendingActions} campaigns ready for review &rarr;</p>
            ) : (
              <p className="text-[13px] text-[#8B8074] font-mono mt-4">Allo is generating campaigns...</p>
            )}
          </Link>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Link href="/analytics" className="block glass-card p-5 group">
            <div className="flex items-center justify-between mb-2">
              <div className="section-header text-[10px] text-muted-foreground">REVENUE</div>
              {(() => {
                const current = stats?.revenueThisMonth ?? 0;
                const baseline = baselineData?.metrics?.totalRevenue;
                if (baseline && baseline > 0) {
                  const pct = Math.round(((current - baseline) / baseline) * 100);
                  const isUp = pct >= 0;
                  return (
                    <span className={isUp ? "trend-pill-up" : "trend-pill-down"}>
                      {isUp ? <TrendingUp className="w-3 h-3 inline mr-1" /> : <TrendingDown className="w-3 h-3 inline mr-1" />}
                      {isUp ? "+" : ""}{pct}%
                    </span>
                  );
                }
                return null;
              })()}
            </div>
            <div className="text-[32px] font-bold text-[#6B7A2F] font-mono tabular-nums leading-tight">
              <AnimatedNumber value={stats?.revenueThisMonth ?? 0} prefix="$" />
            </div>
            <div className="mt-2"><Sparkline data={SPARK_REVENUE} color="var(--olive)" /></div>
            {baselineData?.metrics?.totalRevenue != null && (
              <div className="text-[9px] font-mono text-muted-foreground mt-1">
                Baseline: ${baselineData.metrics.totalRevenue.toLocaleString()}
              </div>
            )}
          </Link>
        </motion.div>
      </div>

      {/* ATTENTION NEEDED */}
      <motion.div variants={itemVariants} className="glass-card-static border-l-[3px] border-l-terracotta p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-header accent-bar-left text-[13px] text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-terracotta" />
            ATTENTION NEEDED
          </h2>
          {attentionItems.length > 0 && (
            <span className="text-[11px] font-mono text-muted-foreground">
              {attentionItems.length} item{attentionItems.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {attentionItems.length > 0 ? (
          <div className="space-y-0">
            {attentionItems.slice(0, 4).map((item, i) => (
              <div key={i} className={`flex gap-3 py-3 ${i < attentionItems.length - 1 ? "border-b border-black/[0.04]" : ""}`}>
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                  item.level === "urgent" ? "bg-[#C44A4A]" : item.level === "moderate" ? "bg-[#B8963E]" : "bg-[#6B7A2F]"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-mono text-foreground font-medium">{item.text}</p>
                  <p className="text-[11px] text-muted-foreground font-sans mt-0.5">{item.detail}</p>
                  <Link href={item.href} className="text-[12px] font-mono text-terracotta hover:text-terracotta/80 transition-colors mt-1 inline-block">
                    {item.action}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 py-2">
            <Check className="w-4 h-4 text-[#6B7A2F]" />
            <p className="text-[13px] font-sans text-muted-foreground">Everything looks good. Your store is on track.</p>
          </div>
        )}
      </motion.div>

      {/* Two-column: AI AGENT ACTIVITY + AUTOMATION STATUS */}
      <div className="grid grid-cols-[3fr_2fr] gap-5">
        <motion.div variants={itemVariants} className="glass-card-static border-l-[3px] border-l-[#B8963E] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-header accent-bar-left text-[13px] text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#B8963E]" />
              AI AGENT ACTIVITY
            </h2>
            <span className="text-[11px] font-mono text-muted-foreground">Last 24 hours</span>
          </div>
          <div className="space-y-0">
            {automationCount > 0 && (
              <div className="flex items-start justify-between py-3 border-b border-black/[0.04]">
                <div className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-[#6B7A2F] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-mono text-foreground">Generated {automationCount} automations</p>
                    <p className="text-[11px] text-muted-foreground font-sans mt-0.5">
                      {programs?.filter((p) => p.status !== "recommended").map((p) => p.name).slice(0, 3).join(", ")}
                      {automationCount > 3 ? `, +${automationCount - 3} more` : ""}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {hasBrand && brandProfile && (
              <div className="flex items-start justify-between py-3 border-b border-black/[0.04]">
                <div className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-[#6B7A2F] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-mono text-foreground">Analyzed brand voice for {brandProfile?.brandName ?? "your store"}</p>
                    <p className="text-[11px] text-muted-foreground font-sans mt-0.5">
                      Tone: {Object.keys(brandProfile?.toneAttributes ?? {}).slice(0, 3).join(" \u00b7 ")}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {hasSyncedData && (
              <div className="flex items-start justify-between py-3 border-b border-black/[0.04]">
                <div className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-[#6B7A2F] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-mono text-foreground">Segmented {stats?.totalCustomers ?? 0} customers into {segmentDist?.length ?? 0} groups</p>
                    <p className="text-[11px] text-muted-foreground font-sans mt-0.5">
                      {segmentDist?.slice(0, 3).map((s) => `${s.segment} (${s.customerCount})`).join(", ")}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {hasSyncedData && (
              <div className="flex items-start justify-between py-3">
                <div className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-[#6B7A2F] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-mono text-foreground">Calculated RFM scores for {stats?.totalCustomers ?? 0} customers</p>
                  </div>
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
                <span className="text-[12px] font-mono text-[#6B7A2F] font-semibold">
                  &middot; ~${estimatedSavings.toLocaleString()} in manual work saved
                </span>
              )}
            </div>
          )}
        </motion.div>

        <motion.div variants={itemVariants} className="glass-card-static p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-header accent-bar-left text-[13px] text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-muted-foreground" />
              AUTOMATIONS
            </h2>
            <Link href="/automations" className="text-[11px] font-mono text-terracotta hover:text-terracotta/80 transition-colors">
              View all &rarr;
            </Link>
          </div>
          {programs && programs.length > 0 ? (
            <div className="space-y-0">
              {programs.map((p, i) => (
                <Link key={p.id} href="/automations" className={`flex items-center justify-between py-2.5 hover:bg-white/10 -mx-2 px-2 rounded-lg transition-colors ${i < programs.length - 1 ? "border-b border-black/[0.03]" : ""}`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      p.status === "active" ? "bg-[#6B7A2F]" :
                      p.status === "ready" ? "bg-[#B8963E]" :
                      p.status === "generating" ? "bg-[#C4704A] animate-pulse" :
                      p.status === "draft" ? "bg-[#C4704A]" :
                      "border border-muted-foreground"
                    }`} />
                    <span className="text-[12px] font-mono text-foreground truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-mono text-muted-foreground capitalize">{p.status}</span>
                    {p.status === "ready" && <span className="text-[10px] font-mono text-terracotta">Go Live &rarr;</span>}
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
              <p className="text-[12px] text-muted-foreground font-sans">No automations yet</p>
              <Link href="/automations" className="text-[12px] font-mono text-terracotta mt-2 inline-block">Generate automations &rarr;</Link>
            </div>
          )}
        </motion.div>
      </div>

      {/* CUSTOMER HEALTH SNAPSHOT */}
      <motion.div variants={itemVariants} className="glass-card-static p-6">
        <h2 className="section-header accent-bar-left text-[13px] text-foreground mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          CUSTOMER HEALTH
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
                    <span className="text-[10px] text-muted-foreground">${Math.round(s.totalRevenue).toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
            {customerStats && (
              <div className="flex items-center gap-6 mb-4 text-[11px] font-mono text-muted-foreground">
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
                  <div className="flex items-start gap-2 p-3 bg-white/20 rounded-lg border border-white/15">
                    <Sparkles className="w-3.5 h-3.5 text-[#B8963E] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[12px] font-sans text-foreground">{pct}% of your base is dormant. A win-back campaign could recover estimated revenue.</p>
                      <Link href="/automations" className="text-[11px] font-mono text-terracotta mt-1 inline-block">Launch Win-Back &rarr;</Link>
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

      {/* Recent activity */}
      <motion.div variants={itemVariants} className="glass-card-static overflow-hidden">
        <div className="px-6 py-4 border-b border-white/15 flex items-center gap-3">
          <h2 className="section-header accent-bar-left text-[13px] text-foreground">RECENT ACTIVITY</h2>
        </div>
        {statsLoading ? (
          <div className="p-6 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-8 glass-skeleton" />)}</div>
        ) : stats?.recentOrders && stats.recentOrders.length > 0 ? (
          <div className="divide-y divide-white/10">
            {stats.recentOrders.map((order) => (
              <div key={order.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-white/10 transition-colors">
                <div className="w-1 h-8 rounded-full bg-olive flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-mono font-bold text-foreground">#{order.orderNumber}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/20 border border-white/15 text-foreground">{order.status}</span>
                  </div>
                  <p className="text-[11px] font-sans text-muted-foreground mt-0.5">{order.customerName} · {new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-[15px] font-mono font-bold text-foreground tabular-nums">${order.totalPrice.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center">
            <ShoppingBag className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-[13px] text-muted-foreground font-sans">No orders yet</p>
            <p className="text-[11px] text-muted-foreground/50 font-sans mt-1">Connect a store and sync data to see activity</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
