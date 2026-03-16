"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Command,
  ChevronDown,
  ChevronRight,
  Check,
  Eye,
  X,
  Pencil,
  Play,
  Zap,
  Brain,
  Users,
  Workflow,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useUser } from "@clerk/nextjs";

// ---------------------------------------------------------------------------
// Shared animation variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
  },
};

const barVariants = {
  hidden: { width: 0 },
  visible: (width: number) => ({
    width: `${width}%`,
    transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 },
  }),
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <span
        className="font-bold tracking-[0.12em] uppercase"
        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#9ca3af" }}
      >
        {children}
      </span>
      {right && (
        <span
          className="tracking-[0.08em] uppercase"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#9ca3af" }}
        >
          {right}
        </span>
      )}
    </div>
  );
}

function Sparkline({ points, color }: { points: string; color: string }) {
  if (!points) return null;
  return (
    <svg width="96" height="24" viewBox="0 0 96 24" fill="none" className="mt-2">
      <polyline
        points={points}
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.5}
      />
    </svg>
  );
}

function DeltaBadge({ delta, direction }: { delta: string; direction: "up" | "down" | "neutral" }) {
  if (direction === "neutral") {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          backgroundColor: "rgba(0,0,0,0.04)",
          color: "#9ca3af",
        }}
      >
        <Minus size={11} />
        {delta}
      </span>
    );
  }
  const isUp = direction === "up";
  const bg = isUp ? "rgba(107,122,47,0.1)" : "rgba(196,112,74,0.1)";
  const fg = isUp ? "#6B7A2F" : "#c4704a";
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        backgroundColor: bg,
        color: fg,
      }}
    >
      {isUp ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {delta}
    </span>
  );
}

function ToolPill({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        color: "#9ca3af",
        backgroundColor: "rgba(0,0,0,0.03)",
        border: "1px solid rgba(0,0,0,0.04)",
      }}
    >
      <Zap size={8} />
      {name}
    </span>
  );
}

interface ReviewItem {
  id: number;
  urgent: boolean;
  title: string;
  confidence: number;
  subtitle: string;
  tools: string[];
  details: string;
  actions: string[];
}

function ReviewCard({
  item,
  index,
  totalItems,
}: {
  item: ReviewItem;
  index: number;
  totalItems: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      variants={itemVariants}
      className="group"
      style={{
        borderBottom: index < totalItems - 1 ? "1px solid rgba(0,0,0,0.04)" : "none",
      }}
    >
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div
            className="mt-1.5 h-2 w-2 rounded-full shrink-0"
            style={{
              backgroundColor: item.urgent ? "#c4704a" : "#d1d5db",
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium leading-snug" style={{ color: "#2c2418" }}>
                  {item.title}
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: "#9ca3af" }}>
                  {item.subtitle}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 font-semibold"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: item.confidence >= 90 ? "#6B7A2F" : item.confidence >= 80 ? "#B8963E" : "#9ca3af",
                  backgroundColor:
                    item.confidence >= 90
                      ? "rgba(107,122,47,0.08)"
                      : item.confidence >= 80
                        ? "rgba(184,150,62,0.08)"
                        : "rgba(0,0,0,0.03)",
                }}
              >
                {item.confidence}%
              </span>
            </div>

            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
              {item.tools.map((t) => (
                <ToolPill key={t} name={t} />
              ))}
            </div>

            {/* Expand / collapse details */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 mt-2.5 text-[11px] font-medium transition-colors duration-150"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: "#9ca3af",
              }}
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {expanded ? "Hide details" : "View details"}
            </button>

            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                  className="overflow-hidden"
                >
                  <p className="text-[12px] leading-relaxed mt-2 pr-4" style={{ color: "#6b7280" }}>
                    {item.details}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3">
              {item.actions.map((action) => {
                const isPrimary = action === "Approve";
                const isDismiss = action === "Dismiss";
                return (
                  <button
                    key={action}
                    className="rounded-md px-3 py-1.5 font-semibold transition-all duration-150 flex items-center gap-1.5"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      backgroundColor: isPrimary ? "#2c2418" : "transparent",
                      color: isPrimary ? "#faf8f5" : isDismiss ? "#9ca3af" : "#2c2418",
                      border: isPrimary ? "none" : "1px solid rgba(0,0,0,0.08)",
                    }}
                  >
                    {action === "Approve" && <Check size={11} />}
                    {action === "Preview" && <Eye size={11} />}
                    {action === "Edit" && <Pencil size={11} />}
                    {action === "Review" && <Eye size={11} />}
                    {action === "Dismiss" && <X size={11} />}
                    {action}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DashboardA() {
  const [activityExpanded, setActivityExpanded] = useState(false);

  // ── Auth & user ──
  const { user } = useUser();
  const rawFirst = user?.firstName || "there";
  const firstName = rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1);

  function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }

  // ── Data queries ──
  const { data: stats } = trpc.dashboard.stats.useQuery();
  const { data: stores, isLoading: storesLoading } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";
  const store = stores?.[0];
  const onboardingDone = !!store?.onboardingCompletedAt;

  const { data: programs } = (trpc.automations.list as any).useQuery(
    storeId ? { storeId } : undefined,
    { enabled: !!storeId && onboardingDone },
  ) as { data: { id: string; name: string; description: string | null; programType: string; status: string }[] | undefined };

  const { data: tokenUsage } = (trpc.dashboard.tokenUsage as any).useQuery(undefined, {
    enabled: onboardingDone,
  }) as { data: { totalInputTokens: number; totalOutputTokens: number; totalCalls: number; totalCost: number } | undefined };

  const { data: customerStats } = (trpc.customers.stats as any).useQuery(undefined, {
    enabled: onboardingDone,
  }) as { data: { totalCustomers: number; acceptsMarketing: number; marketingRate: number; totalRevenue: number; avgOrderValue: number } | undefined };

  const { data: segmentDist } = (trpc.segments.distribution as any).useQuery(undefined, {
    enabled: onboardingDone,
  }) as { data: { segment: string; customerCount: number; totalRevenue: number; avgOrderValue: number }[] | undefined };

  const { data: baselineData } = (trpc as any).briefings.baseline.useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone }
  ) as { data: { metrics?: { totalCustomers?: number; totalRevenue?: number; avgOrderValue?: number }; capturedAt?: string } | undefined };

  const { data: brandProfile } = (trpc.ai.brandProfile as any).useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone },
  ) as { data: any | undefined };

  const { data: brandStatus } = (trpc.ai.brandProfileStatus as any).useQuery(
    { storeId }, { enabled: !!storeId && onboardingDone }
  ) as { data: { exists: boolean } | undefined };

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

  const { data: roiData } = (trpc.analytics.roi as any).useQuery(
    { storeId, days: 30 },
    { enabled: !!storeId && onboardingDone },
  ) as { data: { aiTokenCost: number; aiAttributedRevenue: number; roi: number; campaignsSent: number; automationsSent: number } | undefined };

  const { data: latestAgentRun } = (trpc.automations.latestAgentRun as any).useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone },
  ) as { data: { createdAt: string | Date; status: string } | null | undefined };

  // ── Computed values ──
  const aiCost = tokenUsage?.totalCost ?? 0;
  const aiCalls = tokenUsage?.totalCalls ?? 0;
  const aiRevenue = roiData?.aiAttributedRevenue ?? 0;
  const atRiskCount = segmentDist?.find(s => s.segment === "At Risk" || s.segment === "Hibernating")?.customerCount ?? 0;

  // Helper to make sparkline points from time-series
  function toSparkPoints(points?: { date: string; value: number }[]): string {
    if (!points || points.length < 2) return "";
    const max = Math.max(...points.map(p => p.value));
    const min = Math.min(...points.map(p => p.value));
    const range = max - min || 1;
    return points.map((p, i) => {
      const x = (i / (points.length - 1)) * 92 + 2;
      const y = 20 - ((p.value - min) / range) * 16 + 2;
      return `${x},${y}`;
    }).join(" ");
  }

  // Revenue delta
  const revDelta = (() => {
    const pts = revenueSeries?.points;
    if (!pts || pts.length < 4) return { text: "0%", up: false, neutral: true };
    const mid = Math.floor(pts.length / 2);
    const first = pts.slice(0, mid).reduce((a: number, b: { value: number }) => a + b.value, 0);
    const second = pts.slice(mid).reduce((a: number, b: { value: number }) => a + b.value, 0);
    if (first === 0 && second === 0) return { text: "0%", up: false, neutral: true };
    if (first === 0) return { text: "+100%", up: true, neutral: false };
    const pct = Math.round(((second - first) / first) * 100);
    return { text: pct > 0 ? `+${pct}%` : `${pct}%`, up: pct > 0, neutral: pct === 0 };
  })();

  // Customer delta
  const custDelta = (() => {
    const baseline = baselineData?.metrics?.totalCustomers;
    if (!baseline) return { text: "0%", up: false, neutral: true };
    const current = stats?.totalCustomers ?? 0;
    const pct = Math.round(((current - baseline) / baseline) * 100);
    return { text: pct > 0 ? `+${pct}%` : `${pct}%`, up: pct > 0, neutral: pct === 0 };
  })();

  // KPI items
  const kpiItems = [
    { label: "AI Revenue", value: `$${Math.round(aiRevenue).toLocaleString()}`, delta: revDelta.text, direction: (revDelta.neutral ? "neutral" : revDelta.up ? "up" : "down") as "up" | "down" | "neutral", sparkline: toSparkPoints(revenueSeries?.points) },
    { label: "Customers", value: `${(stats?.totalCustomers ?? 0).toLocaleString()}`, delta: custDelta.text, direction: (custDelta.neutral ? "neutral" : custDelta.up ? "up" : "down") as "up" | "down" | "neutral", sparkline: toSparkPoints(customerSeries?.points) },
    { label: "At Risk", value: `${atRiskCount}`, delta: "0%", direction: "neutral" as const, sparkline: "" },
    { label: "Agent Actions", value: `${aiCalls}`, delta: "0%", direction: "neutral" as const, sparkline: toSparkPoints(orderSeries?.points) },
  ];

  // ── Review items ──
  const reviewItems: ReviewItem[] = [];

  if (segmentDist) {
    const hibernating = segmentDist.find(s => s.segment === "Lost" || s.segment === "Hibernating");
    if (hibernating && hibernating.customerCount > 0) {
      reviewItems.push({
        id: 1, urgent: true,
        title: `Win-back campaign for ${hibernating.customerCount} dormant customers`,
        confidence: 87,
        subtitle: `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(hibernating.totalRevenue)} in past revenue at risk`,
        tools: ["rfm-analysis", "email-composer", "segment-query"],
        details: `Identified ${hibernating.customerCount} customers whose activity has significantly dropped. A targeted win-back campaign could recover a portion of this revenue.`,
        actions: ["Approve", "Preview", "Dismiss"],
      });
    }
  }
  if (customerStats && customerStats.marketingRate === 0) {
    reviewItems.push({
      id: 2, urgent: true,
      title: "Set up lead capture for marketing opt-ins",
      confidence: 92,
      subtitle: "Marketing opt-in rate is currently 0%",
      tools: ["form-builder"],
      details: "No customers have opted in to marketing communications. A lead capture form would start building your marketable audience.",
      actions: ["Approve", "Review", "Dismiss"],
    });
  }
  if (programs) {
    const ready = programs.filter(p => p.status === "ready");
    if (ready.length > 0) {
      reviewItems.push({
        id: 3, urgent: false,
        title: `${ready.length} automation${ready.length > 1 ? "s" : ""} ready to activate`,
        confidence: 94,
        subtitle: ready.map(p => p.name).join(", "),
        tools: ["workflow-builder"],
        details: `These automations have been generated and are ready for your review. Activating them will start sending personalized messages to matching customers.`,
        actions: ["Approve", "Review", "Dismiss"],
      });
    }
  }

  // ── Agent activity ──
  const hasBrand = brandStatus?.exists ?? false;
  const hasSyncedData = (stats?.totalCustomers ?? 0) > 0;
  const automationCount = programs?.filter(p => p.status !== "recommended").length ?? 0;

  const agentActivity: { text: string; time: string; tools: string[]; icon: typeof Users }[] = [];
  if (automationCount > 0) {
    agentActivity.push({ text: `Created ${automationCount} automation workflows`, time: "Recently", tools: ["workflow-builder"], icon: Workflow });
  }
  if (hasBrand && brandProfile) {
    agentActivity.push({ text: `Analyzed brand voice for ${brandProfile?.brandName ?? "your store"}`, time: "Recently", tools: ["brand-analyzer"], icon: Brain });
  }
  if (hasSyncedData) {
    agentActivity.push({ text: `Segmented ${stats?.totalCustomers ?? 0} customers into ${segmentDist?.length ?? 0} groups`, time: "Recently", tools: ["rfm-engine"], icon: Users });
  }

  // ── Customer segments ──
  const SEGMENT_COLORS: Record<string, string> = {
    Champions: "#6B7A2F", "Loyal Customers": "#6B7A2F", "Potential Loyalists": "#6B7A2F",
    "New Customers": "#8A7D6B", "At Risk": "#c4704a", Hibernating: "#d1d5db", Lost: "#d1d5db",
  };

  const totalCustomers = segmentDist?.reduce((sum, s) => sum + s.customerCount, 0) ?? 0;
  const segments = (segmentDist ?? []).filter(s => s.customerCount > 0).map(s => {
    const pct = totalCustomers > 0 ? Math.round((s.customerCount / totalCustomers) * 100) : 0;
    return { name: s.segment, count: s.customerCount, pct, width: pct, color: SEGMENT_COLORS[s.segment] ?? "#d1d5db" };
  });

  // ── Automations ──
  const automations = (programs ?? []).map(p => ({
    name: p.name,
    status: p.status as "active" | "ready" | "draft" | "generating" | "recommended",
    metric: null as string | null,
  }));

  // ── Greeting subtitle ──
  const attentionCount = (segmentDist?.find(s => s.segment === "At Risk" || s.segment === "Hibernating")?.customerCount ?? 0) > 0 ? 1 : 0;
  const readyCount = programs?.filter(p => p.status === "ready").length ?? 0;
  const totalAttention = attentionCount + readyCount + (customerStats?.marketingRate === 0 ? 1 : 0);

  // ── Last sync ──
  const lastSyncText = (() => {
    if (!latestAgentRun?.createdAt) return "No activity yet";
    const diff = Date.now() - new Date(latestAgentRun.createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Last sync just now";
    if (mins < 60) return `Last sync ${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Last sync ${hours}h ago`;
    return `Last sync ${Math.floor(hours / 24)}d ago`;
  })();

  // ── Loading state ──
  if (storesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: "#faf8f5" }}>
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Google Fonts — JetBrains Mono */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <div className="min-h-screen" style={{ backgroundColor: "#faf8f5", color: "#2c2418" }}>
        {/* -- Sticky top bar -- */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="sticky top-0 z-50 backdrop-blur-md"
          style={{
            backgroundColor: "rgba(250,248,245,0.85)",
            borderBottom: "1px solid rgba(0,0,0,0.05)",
          }}
        >
          <div className="mx-auto max-w-3xl flex items-center justify-between px-6 py-3">
            <button
              className="flex items-center gap-2 text-[12px] font-medium transition-colors duration-150"
              style={{ color: "#9ca3af", fontFamily: "'JetBrains Mono', monospace" }}
            >
              <ArrowLeft size={14} />
              Dashboard
            </button>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50"
                    style={{ backgroundColor: "#6B7A2F" }}
                  />
                  <span
                    className="relative inline-flex h-2 w-2 rounded-full"
                    style={{ backgroundColor: "#6B7A2F" }}
                  />
                </span>
                <span
                  className="text-[11px] font-semibold tracking-[0.06em]"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: "#6B7A2F" }}
                >
                  Agent Live
                </span>
              </div>
              <span
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "#9ca3af",
                  backgroundColor: "rgba(0,0,0,0.03)",
                  border: "1px solid rgba(0,0,0,0.05)",
                }}
              >
                <Command size={11} />K
              </span>
            </div>
          </div>
        </motion.header>

        {/* -- Main content -- */}
        <motion.main
          className="mx-auto max-w-3xl px-6 pt-12 pb-24"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* -- Greeting -- */}
          <motion.section variants={itemVariants} className="mb-10">
            <h1
              className="text-[28px] font-semibold tracking-[-0.02em] leading-tight"
              style={{ color: "#2c2418" }}
            >
              {getGreeting()}, {firstName}
            </h1>
            <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: "#9ca3af" }}>
              {totalAttention} item{totalAttention !== 1 ? "s" : ""} need your attention{" "}
              <span style={{ color: "#d1d5db" }}>&middot;</span> Agent performed {aiCalls} actions
            </p>
          </motion.section>

          {/* -- KPI Cards -- */}
          <motion.section variants={itemVariants} className="mb-10">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {kpiItems.map((kpi) => (
                <motion.div
                  key={kpi.label}
                  variants={itemVariants}
                  className="rounded-xl px-4 py-4"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.5)",
                    border: "1px solid rgba(0,0,0,0.05)",
                  }}
                >
                  <span
                    className="font-bold tracking-[0.12em] uppercase block"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10,
                      color: "#9ca3af",
                    }}
                  >
                    {kpi.label}
                  </span>
                  <span
                    className="block mt-1 font-bold tracking-[-0.03em]"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 32,
                      lineHeight: 1.1,
                      color: "#2c2418",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {kpi.value}
                  </span>
                  <div className="flex items-center justify-between mt-1">
                    <DeltaBadge delta={kpi.delta} direction={kpi.direction} />
                  </div>
                  <Sparkline
                    points={kpi.sparkline}
                    color={kpi.direction === "up" ? "#6B7A2F" : kpi.direction === "down" ? "#c4704a" : "#9ca3af"}
                  />
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* -- Needs Your Review -- */}
          <motion.section variants={itemVariants} className="mb-10">
            <SectionLabel right={`${reviewItems.length}`}>Needs Your Review</SectionLabel>
            {reviewItems.length > 0 ? (
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  backgroundColor: "rgba(255,255,255,0.55)",
                  border: "1px solid rgba(0,0,0,0.05)",
                  borderLeft: "2px solid #c4704a",
                }}
              >
                {reviewItems.map((item, i) => (
                  <ReviewCard key={item.id} item={item} index={i} totalItems={reviewItems.length} />
                ))}
              </div>
            ) : (
              <div
                className="rounded-xl px-5 py-6 text-center"
                style={{
                  backgroundColor: "rgba(255,255,255,0.55)",
                  border: "1px solid rgba(0,0,0,0.05)",
                }}
              >
                <div className="flex items-center justify-center gap-2">
                  <Check size={14} style={{ color: "#6B7A2F" }} />
                  <span className="text-[13px] font-medium" style={{ color: "#6B7A2F" }}>
                    All clear — nothing needs your attention right now
                  </span>
                </div>
              </div>
            )}
          </motion.section>

          {/* -- Agent Activity -- */}
          <motion.section variants={itemVariants} className="mb-10">
            <SectionLabel right="Last 24h">Agent Activity</SectionLabel>
            <div
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: "rgba(255,255,255,0.5)",
                border: "1px solid rgba(0,0,0,0.05)",
              }}
            >
              {agentActivity.length > 0 ? (
                <>
                  {agentActivity.slice(0, activityExpanded ? undefined : 3).map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <motion.div
                        key={i}
                        variants={itemVariants}
                        className="flex items-start gap-3 px-5 py-3.5 group transition-colors duration-150"
                        style={{
                          borderBottom:
                            i < (activityExpanded ? agentActivity.length : Math.min(agentActivity.length, 3)) - 1
                              ? "1px solid rgba(0,0,0,0.04)"
                              : "none",
                        }}
                      >
                        <div
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: "rgba(107,122,47,0.08)" }}
                        >
                          <Check size={11} style={{ color: "#6B7A2F" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-[13px] font-medium" style={{ color: "#2c2418" }}>
                              {item.text}
                            </p>
                            <div className="flex items-center gap-2 shrink-0">
                              <Icon size={12} style={{ color: "#d1d5db" }} />
                              <span
                                className="text-[11px]"
                                style={{
                                  fontFamily: "'JetBrains Mono', monospace",
                                  color: "#d1d5db",
                                }}
                              >
                                {item.time}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            {item.tools.map((t) => (
                              <ToolPill key={t} name={t} />
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Show more / less */}
                  {agentActivity.length > 3 && (
                    <button
                      onClick={() => setActivityExpanded(!activityExpanded)}
                      className="w-full px-5 py-2.5 text-[11px] font-medium transition-colors duration-150 flex items-center justify-center gap-1"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "#9ca3af",
                        borderTop: "1px solid rgba(0,0,0,0.04)",
                      }}
                    >
                      {activityExpanded ? (
                        <>
                          Show less <ChevronDown size={11} className="rotate-180" />
                        </>
                      ) : (
                        <>
                          Show {agentActivity.length - 3} more <ChevronDown size={11} />
                        </>
                      )}
                    </button>
                  )}
                </>
              ) : (
                <div className="px-5 py-6 text-center">
                  <span className="text-[13px]" style={{ color: "#9ca3af" }}>
                    No agent activity yet
                  </span>
                </div>
              )}

              {/* Cost footer */}
              <div
                className="px-5 py-3 flex items-center gap-4"
                style={{ borderTop: "1px solid rgba(0,0,0,0.04)" }}
              >
                {[
                  { label: "AI Cost", value: `$${aiCost < 0.01 ? "<0.01" : aiCost.toFixed(2)}` },
                  { label: "Actions", value: `${aiCalls}` },
                  { label: "Success", value: "98%" },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-center gap-1.5">
                    <span
                      className="text-[10px] uppercase tracking-[0.08em]"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: "#d1d5db" }}
                    >
                      {stat.label}
                    </span>
                    <span
                      className="text-[12px] font-semibold"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "#2c2418",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {stat.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>

          {/* -- Customer Health -- */}
          <motion.section variants={itemVariants} className="mb-10">
            <SectionLabel right={`${totalCustomers.toLocaleString()} total`}>Customer Health</SectionLabel>
            <div
              className="rounded-xl px-5 py-4"
              style={{
                backgroundColor: "rgba(255,255,255,0.5)",
                border: "1px solid rgba(0,0,0,0.05)",
              }}
            >
              <div className="space-y-3.5">
                {segments.map((seg) => (
                  <motion.div key={seg.name} variants={itemVariants}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13px] font-medium" style={{ color: "#2c2418" }}>
                        {seg.name}
                      </span>
                      <div className="flex items-center gap-3">
                        <span
                          className="text-[12px] font-semibold"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            color: "#2c2418",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {seg.count}
                        </span>
                        <span
                          className="text-[11px]"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            color: "#d1d5db",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {seg.pct}%
                        </span>
                      </div>
                    </div>
                    <div
                      className="h-1.5 rounded-full overflow-hidden"
                      style={{ backgroundColor: "rgba(0,0,0,0.04)" }}
                    >
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          backgroundColor: seg.color,
                          opacity: seg.color === "#d1d5db" ? 0.5 : 0.6,
                        }}
                        custom={seg.width}
                        variants={barVariants}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.section>

          {/* -- Automations -- */}
          <motion.section variants={itemVariants} className="mb-10">
            <SectionLabel
              right={`${automations.filter((a) => a.status === "active").length} active`}
            >
              Automations
            </SectionLabel>
            <div
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: "rgba(255,255,255,0.5)",
                border: "1px solid rgba(0,0,0,0.05)",
              }}
            >
              {automations.length > 0 ? (
                automations.map((auto, i) => (
                  <motion.div
                    key={auto.name}
                    variants={itemVariants}
                    className="flex items-center justify-between px-5 py-3.5 transition-colors duration-150"
                    style={{
                      borderBottom:
                        i < automations.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            auto.status === "active"
                              ? "#6B7A2F"
                              : auto.status === "ready"
                                ? "#B8963E"
                                : "#d1d5db",
                        }}
                      />
                      <span className="text-[13px] font-medium" style={{ color: "#2c2418" }}>
                        {auto.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className="text-[10px] font-semibold uppercase tracking-[0.08em]"
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          color:
                            auto.status === "active"
                              ? "#6B7A2F"
                              : auto.status === "ready"
                                ? "#B8963E"
                                : "#9ca3af",
                        }}
                      >
                        {auto.status === "active"
                          ? "Active"
                          : auto.status === "ready"
                            ? "Ready"
                            : auto.status === "generating"
                              ? "Generating"
                              : auto.status === "recommended"
                                ? "Recommended"
                                : "Draft"}
                      </span>
                      {auto.metric ? (
                        <span
                          className="text-[13px] font-semibold w-10 text-right"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            color: "#2c2418",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {auto.metric}
                        </span>
                      ) : auto.status === "ready" ? (
                        <button
                          className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] transition-all duration-150"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            backgroundColor: "#2c2418",
                            color: "#faf8f5",
                          }}
                        >
                          <Play size={9} />
                          Go
                        </button>
                      ) : (
                        <span className="w-10" />
                      )}
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="px-5 py-6 text-center">
                  <span className="text-[13px]" style={{ color: "#9ca3af" }}>
                    No automations yet
                  </span>
                </div>
              )}
            </div>
          </motion.section>

          {/* -- Footer -- */}
          <motion.footer
            variants={itemVariants}
            className="pt-8 flex items-center justify-center gap-3"
            style={{ borderTop: "1px solid rgba(0,0,0,0.04)" }}
          >
            <ShieldCheck size={12} style={{ color: "#d1d5db" }} />
            <span
              className="text-[10px] tracking-[0.06em]"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: "#d1d5db" }}
            >
              All actions are logged and reversible
            </span>
            <span style={{ color: "#e5e7eb" }}>&middot;</span>
            <Clock size={12} style={{ color: "#d1d5db" }} />
            <span
              className="text-[10px] tracking-[0.06em]"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: "#d1d5db" }}
            >
              {lastSyncText}
            </span>
          </motion.footer>
        </motion.main>
      </div>
    </>
  );
}
