"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Users,
  Mail,
  BarChart3,
  Settings,
  Search,
  ArrowRight,
  CheckCircle2,
  Eye,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Send,
  Sparkles,
  Hash,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useUser } from "@clerk/nextjs";

// ---------------------------------------------------------------------------
// Sparkline SVG component
// ---------------------------------------------------------------------------
function Sparkline({
  data,
  color,
  width = 64,
  height = 24,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={`grad-${color.replace("#", "")}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={color} stopOpacity={0.15} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints}
        fill={`url(#grad-${color.replace("#", "")})`}
      />
      <polyline
        points={points}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pulse dot for live indicators
// ---------------------------------------------------------------------------
function PulseDot({ color = "#6B7A2F" }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
        style={{ backgroundColor: color }}
      />
      <span
        className="relative inline-flex h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Risk bar component
// ---------------------------------------------------------------------------
function RiskBar({ percent }: { percent: number }) {
  const color =
    percent >= 90 ? "#c4704a" : percent >= 80 ? "#B8963E" : "#6B7A2F";
  return (
    <div
      className="h-1 w-full rounded-full"
      style={{ backgroundColor: "rgba(0,0,0,0.06)" }}
    >
      <motion.div
        className="h-1 rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confidence arc component
// ---------------------------------------------------------------------------
function ConfidenceArc({ score }: { score: number }) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex items-center gap-1.5">
      <svg width="34" height="34" viewBox="0 0 34 34">
        <circle
          cx="17"
          cy="17"
          r={radius}
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth="3"
        />
        <motion.circle
          cx="17"
          cy="17"
          r={radius}
          fill="none"
          stroke="#6B7A2F"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: "easeOut" }}
          transform="rotate(-90 17 17)"
        />
        <text
          x="17"
          y="17"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#2c2418"
          fontSize="9"
          fontWeight="600"
        >
          {score}
        </text>
      </svg>
      <span
        className="text-[10px] font-medium uppercase tracking-wider"
        style={{ color: "#6B7A2F" }}
      >
        confidence
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------
function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 py-3">
      <div
        className="flex h-7 w-7 items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(196,112,74,0.1)" }}
      >
        <Sparkles size={13} style={{ color: "#c4704a" }} />
      </div>
      <span className="text-xs" style={{ color: "rgba(44,36,24,0.4)" }}>
        Agent is analyzing trends
      </span>
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="inline-block h-1 w-1 rounded-full"
            style={{ backgroundColor: "rgba(44,36,24,0.3)" }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
            }}
          />
        ))}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool pill component
// ---------------------------------------------------------------------------
function ToolPill({
  label,
  index,
}: {
  label: string;
  index: number;
}) {
  return (
    <motion.span
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: "rgba(107,122,47,0.08)",
        color: "#6B7A2F",
        border: "1px solid rgba(107,122,47,0.12)",
      }}
    >
      <span style={{ fontSize: "9px" }}>&#x27E8;</span>
      {label}
      <span style={{ fontSize: "9px" }}>&#x27E9;</span>
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------
function KpiCard({
  label,
  value,
  delta,
  positive,
  sparkData,
  color,
}: {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  sparkData: number[];
  color: string;
}) {
  return (
    <div
      className="flex-1 rounded-lg px-4 py-3"
      style={{
        backgroundColor: "rgba(255,255,255,0.7)",
        border: "1px solid rgba(0,0,0,0.05)",
      }}
    >
      <div
        className="mb-1 text-[10px] font-medium uppercase tracking-wider"
        style={{ color: "rgba(44,36,24,0.45)", fontFamily: "monospace" }}
      >
        {label}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div
            className="text-xl font-semibold"
            style={{ color: "#2c2418" }}
          >
            {value}
          </div>
          <div
            className="mt-0.5 text-[11px] font-medium"
            style={{ color: positive ? "#6B7A2F" : "#c4704a" }}
          >
            {delta}
          </div>
        </div>
        <Sparkline data={sparkData} color={color} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer risk card
// ---------------------------------------------------------------------------
function CustomerRiskCard({
  initials,
  name,
  risk,
  ltv,
  transition: trans,
  daysAgo,
}: {
  initials: string;
  name: string;
  risk: number;
  ltv: string;
  transition: string;
  daysAgo: number;
}) {
  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{
        backgroundColor: "rgba(255,255,255,0.7)",
        border: "1px solid rgba(0,0,0,0.05)",
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
            style={{
              backgroundColor: "rgba(196,112,74,0.1)",
              color: "#c4704a",
            }}
          >
            {initials}
          </div>
          <div>
            <div
              className="text-sm font-medium"
              style={{ color: "#2c2418" }}
            >
              {name}
            </div>
            <div
              className="text-[11px]"
              style={{ color: "rgba(44,36,24,0.5)" }}
            >
              {trans} &middot; {daysAgo}d since last order
            </div>
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-sm font-semibold"
            style={{ color: "#c4704a" }}
          >
            {risk}%
          </div>
          <div
            className="text-[10px]"
            style={{
              color: "rgba(44,36,24,0.4)",
              fontFamily: "monospace",
            }}
          >
            RISK
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <div
          className="text-[11px] font-medium"
          style={{ color: "rgba(44,36,24,0.5)" }}
        >
          LTV {ltv}
        </div>
        <div className="w-24">
          <RiskBar percent={risk} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------
const navItems = [
  { icon: Zap, label: "Agent", active: true },
  { icon: Users, label: "Customers", active: false },
  { icon: Mail, label: "Campaigns", active: false },
  { icon: BarChart3, label: "Analytics", active: false },
  { icon: Settings, label: "Settings", active: false },
];

// ---------------------------------------------------------------------------
// Suggestion chips
// ---------------------------------------------------------------------------
const suggestions = [
  "Win-back campaigns",
  "Churn overview",
  "Welcome series",
  "Revenue analysis",
  "Top segments",
];

// ---------------------------------------------------------------------------
// Active conversations (mock — no conversations API yet)
// ---------------------------------------------------------------------------
const conversations = [
  {
    name: "Sarah K.",
    subject: "Order tracking #4892",
    unread: false,
    escalated: false,
  },
  {
    name: "Alex T.",
    subject: "Return request",
    unread: true,
    escalated: true,
  },
];

// ---------------------------------------------------------------------------
// Helper: convert time-series points to sparkline values
// ---------------------------------------------------------------------------
function toSparkValues(points?: { date: string; value: number }[]): number[] {
  if (!points || points.length < 2) return [0, 0];
  return points.map((p) => p.value);
}

// ---------------------------------------------------------------------------
// Helper: greeting based on time of day
// ---------------------------------------------------------------------------
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------
export default function DashboardB() {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);

  // --- Auth ---
  const { user } = useUser();
  const rawFirst = user?.firstName || "there";
  const firstName = rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1);

  // --- Data queries ---
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

  const { data: _customerStats } = (trpc.customers.stats as any).useQuery(undefined, {
    enabled: onboardingDone,
  }) as { data: { totalCustomers: number; acceptsMarketing: number; marketingRate: number; totalRevenue: number; avgOrderValue: number } | undefined };
  void _customerStats; // pre-fetched for cache

  const { data: segmentDist } = (trpc.segments.distribution as any).useQuery(undefined, {
    enabled: onboardingDone,
  }) as { data: { segment: string; customerCount: number; totalRevenue: number; avgOrderValue: number }[] | undefined };

  const { data: baselineData } = (trpc as any).briefings.baseline.useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone },
  ) as { data: { metrics?: { totalCustomers?: number; totalRevenue?: number; avgOrderValue?: number }; capturedAt?: string } | undefined };

  const { data: brandProfile } = (trpc.ai.brandProfile as any).useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone },
  ) as { data: any | undefined };

  const { data: brandStatus } = (trpc.ai.brandProfileStatus as any).useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone },
  ) as { data: { exists: boolean } | undefined };

  const { data: revenueSeries } = trpc.dashboard.timeSeries.useQuery(
    { metric: "revenue", days: "30" },
    { enabled: onboardingDone },
  );
  const { data: customerSeries } = trpc.dashboard.timeSeries.useQuery(
    { metric: "customers", days: "30" },
    { enabled: onboardingDone },
  );

  const { data: roiData } = (trpc.analytics.roi as any).useQuery(
    { storeId, days: 30 },
    { enabled: !!storeId && onboardingDone },
  ) as { data: { aiTokenCost: number; aiAttributedRevenue: number; roi: number; campaignsSent: number; automationsSent: number } | undefined };

  const { data: _latestAgentRun } = (trpc.automations.latestAgentRun as any).useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone },
  ) as { data: { createdAt: string | Date; status: string } | null | undefined };
  void _latestAgentRun; // pre-fetched for cache

  // --- Computed values ---
  const aiCost = tokenUsage?.totalCost ?? 0;
  const aiCalls = tokenUsage?.totalCalls ?? 0;
  const aiRevenue = Math.round(roiData?.aiAttributedRevenue ?? 0);
  const totalCustomers = stats?.totalCustomers ?? 0;
  const hasBrand = brandStatus?.exists ?? false;
  const hasSyncedData = totalCustomers > 0;
  const automationCount = programs?.filter((p) => p.status !== "recommended").length ?? 0;
  const atRiskCount =
    segmentDist?.find((s) => s.segment === "At Risk" || s.segment === "Hibernating")?.customerCount ?? 0;

  // Revenue delta from time-series
  const revenueDelta = useMemo(() => {
    const pts = (revenueSeries as any)?.points as { date: string; value: number }[] | undefined;
    if (!pts || pts.length < 4) return { pct: 0, label: "no data yet" };
    const mid = Math.floor(pts.length / 2);
    const first = pts.slice(0, mid).reduce((a, b) => a + b.value, 0);
    const second = pts.slice(mid).reduce((a, b) => a + b.value, 0);
    if (first === 0) return { pct: 0, label: "no baseline" };
    const pct = Math.round(((second - first) / first) * 100);
    return { pct, label: `${pct >= 0 ? "+" : ""}${pct}% vs 30d` };
  }, [revenueSeries]);

  // Customer delta from baseline
  const customerDelta = useMemo(() => {
    const baseline = baselineData?.metrics?.totalCustomers ?? 0;
    if (baseline === 0) return { pct: 0, label: "no baseline" };
    const pct = Math.round(((totalCustomers - baseline) / baseline) * 100);
    return { pct, label: `${pct >= 0 ? "+" : ""}${pct}% vs baseline` };
  }, [baselineData, totalCustomers]);

  // Revenue trend for insights
  const revTrending = useMemo(() => {
    const pts = (revenueSeries as any)?.points as { date: string; value: number }[] | undefined;
    if (!pts || pts.length < 4) return null;
    const mid = Math.floor(pts.length / 2);
    const first = pts.slice(0, mid).reduce((a, b) => a + b.value, 0);
    const second = pts.slice(mid).reduce((a, b) => a + b.value, 0);
    if (first === 0) return null;
    const pct = Math.round(((second - first) / first) * 100);
    if (pct < -10) return { pct, direction: "down" as const };
    if (pct > 10) return { pct, direction: "up" as const };
    return null;
  }, [revenueSeries]);

  // Live activity items built from real data
  const liveActivityItems = useMemo(() => {
    const items: { icon: typeof Zap; text: string; time: string; color: string }[] = [];
    if (automationCount > 0)
      items.push({
        icon: Zap,
        text: `Created ${automationCount} automation${automationCount !== 1 ? "s" : ""}`,
        time: "Recently",
        color: "#6B7A2F",
      });
    if (hasBrand)
      items.push({
        icon: Hash,
        text: `Brand voice analyzed${brandProfile?.brandName ? ` for ${brandProfile.brandName}` : ""}`,
        time: "Recently",
        color: "#B8963E",
      });
    if (hasSyncedData)
      items.push({
        icon: Users,
        text: `Segmented ${totalCustomers.toLocaleString()} customers into ${segmentDist?.length ?? 0} groups`,
        time: "Recently",
        color: "#6B7A2F",
      });
    if (aiCalls > 0)
      items.push({
        icon: ShieldCheck,
        text: `${aiCalls} AI actions performed`,
        time: "Recently",
        color: "#c4704a",
      });
    // Fallback if no real activity
    if (items.length === 0)
      items.push({
        icon: Sparkles,
        text: "Agent is standing by",
        time: "Now",
        color: "#6B7A2F",
      });
    return items;
  }, [automationCount, hasBrand, brandProfile, hasSyncedData, totalCustomers, segmentDist, aiCalls]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const messageVariants = {
    hidden: { opacity: 0, y: 6 },
    visible: { opacity: 1, y: 0 },
  };

  // --- Loading state ---
  if (storesLoading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ backgroundColor: "#faf8f5" }}
      >
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
      </div>
    );
  }

  // Sparkline data from time-series
  const revenueSparkData = toSparkValues((revenueSeries as any)?.points);
  const customerSparkData = toSparkValues((customerSeries as any)?.points);

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ backgroundColor: "#faf8f5" }}
    >
      {/* ----------------------------------------------------------------- */}
      {/* Left mini sidebar                                                  */}
      {/* ----------------------------------------------------------------- */}
      <div
        className="relative flex h-full w-16 flex-col items-center justify-between py-5"
        style={{
          backgroundColor: "rgba(237,231,219,0.45)",
          borderRight: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <div className="flex flex-col items-center gap-1">
          {/* Logo */}
          <div
            className="mb-5 flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold"
            style={{
              background:
                "linear-gradient(135deg, #c4704a 0%, #B8963E 100%)",
              color: "#fff",
            }}
          >
            A
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.active;
            return (
              <div key={item.label} className="relative">
                <button
                  onMouseEnter={() => setHoveredNav(item.label)}
                  onMouseLeave={() => setHoveredNav(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-150"
                  style={{
                    backgroundColor: isActive
                      ? "rgba(196,112,74,0.1)"
                      : "transparent",
                    color: isActive
                      ? "#c4704a"
                      : "rgba(44,36,24,0.4)",
                  }}
                >
                  <Icon size={18} />
                </button>
                {/* Tooltip */}
                <AnimatePresence>
                  {hoveredNav === item.label && (
                    <motion.div
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute left-12 top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium"
                      style={{
                        backgroundColor: "#2c2418",
                        color: "#faf8f5",
                      }}
                    >
                      {item.label}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Bottom avatar */}
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold"
          style={{
            backgroundColor: "rgba(44,36,24,0.08)",
            color: "#2c2418",
          }}
        >
          {firstName.charAt(0).toUpperCase()}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Main conversation area                                             */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div
          className="flex h-13 shrink-0 items-center justify-between px-6"
          style={{
            borderBottom: "1px solid rgba(0,0,0,0.05)",
            height: "52px",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles size={15} style={{ color: "#c4704a" }} />
              <span
                className="text-sm font-semibold"
                style={{ color: "#2c2418" }}
              >
                Allo Agent
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <PulseDot color="#6B7A2F" />
              <span
                className="text-[11px] font-medium"
                style={{ color: "#6B7A2F" }}
              >
                Active
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1"
              style={{
                backgroundColor: "rgba(107,122,47,0.08)",
                border: "1px solid rgba(107,122,47,0.1)",
              }}
            >
              <span
                className="text-xs font-semibold"
                style={{ color: "#6B7A2F" }}
              >
                {aiRevenue > 0 ? `$${aiRevenue.toLocaleString()}` : "$0"}
              </span>
              <span
                className="text-[10px]"
                style={{ color: "rgba(107,122,47,0.6)" }}
              >
                AI revenue
              </span>
            </div>
            <button
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-150"
              style={{
                backgroundColor: "rgba(0,0,0,0.03)",
                color: "rgba(44,36,24,0.5)",
                border: "1px solid rgba(0,0,0,0.06)",
              }}
            >
              <Search size={12} />
              <span
                className="rounded px-1 py-0.5 text-[10px]"
                style={{
                  backgroundColor: "rgba(0,0,0,0.04)",
                  fontFamily: "monospace",
                }}
              >
                &#8984;K
              </span>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[800px] px-6 py-6">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                visible: {
                  transition: { staggerChildren: 0.06 },
                },
              }}
              className="flex flex-col gap-6"
            >
              {/* ---- Message 1: Agent greeting ---- */}
              <motion.div variants={messageVariants} className="flex gap-3">
                <div
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: "rgba(196,112,74,0.1)" }}
                >
                  <Sparkles size={13} style={{ color: "#c4704a" }} />
                </div>
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className="text-[11px] font-semibold"
                      style={{ color: "rgba(44,36,24,0.5)" }}
                    >
                      Allo Agent
                    </span>
                    <span
                      className="text-[9px]"
                      style={{ color: "rgba(44,36,24,0.25)" }}
                    >
                      {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                  <p
                    className="text-[14px] leading-relaxed"
                    style={{ color: "#2c2418" }}
                  >
                    {getGreeting()}, {firstName}.{" "}
                    {aiCalls > 0 ? (
                      <>
                        I performed{" "}
                        <span className="font-semibold">{aiCalls} actions</span>
                        {aiRevenue > 0 && (
                          <>
                            {" "}and drove{" "}
                            <span
                              className="font-semibold"
                              style={{ color: "#6B7A2F" }}
                            >
                              ${aiRevenue.toLocaleString()} in AI-attributed revenue
                            </span>
                          </>
                        )}
                        .
                      </>
                    ) : (
                      <>Your retention system is active.</>
                    )}
                  </p>
                </div>
              </motion.div>

              {/* ---- Message 2: KPI cards ---- */}
              <motion.div variants={messageVariants} className="ml-10">
                <div className="grid grid-cols-4 gap-2.5">
                  <KpiCard
                    label="AI Revenue"
                    value={`$${aiRevenue.toLocaleString()}`}
                    delta={revenueDelta.label}
                    positive={revenueDelta.pct >= 0}
                    sparkData={revenueSparkData.length >= 2 ? revenueSparkData : [0, 0]}
                    color="#6B7A2F"
                  />
                  <KpiCard
                    label="Customers"
                    value={totalCustomers.toLocaleString()}
                    delta={customerDelta.label}
                    positive={customerDelta.pct >= 0}
                    sparkData={customerSparkData.length >= 2 ? customerSparkData : [0, 0]}
                    color="#6B7A2F"
                  />
                  <KpiCard
                    label="At Risk"
                    value={atRiskCount.toString()}
                    delta={atRiskCount > 0 ? "needs attention" : "all clear"}
                    positive={atRiskCount === 0}
                    sparkData={[0, 0]}
                    color="#B8963E"
                  />
                  <KpiCard
                    label="Agent Actions"
                    value={aiCalls.toString()}
                    delta={aiCalls > 0 ? `$${aiCost.toFixed(2)} cost` : "no actions yet"}
                    positive={aiCalls > 0}
                    sparkData={[0, 0]}
                    color="#c4704a"
                  />
                </div>
              </motion.div>

              {/* ---- Message 3: Priority with confidence ---- */}
              {atRiskCount > 0 && (
                <motion.div variants={messageVariants} className="flex gap-3">
                  <div
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: "rgba(196,112,74,0.1)" }}
                  >
                    <Sparkles size={13} style={{ color: "#c4704a" }} />
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className="text-[11px] font-semibold"
                        style={{ color: "rgba(44,36,24,0.5)" }}
                      >
                        Allo Agent
                      </span>
                      <span
                        className="text-[9px]"
                        style={{ color: "rgba(44,36,24,0.25)" }}
                      >
                        {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                    <div
                      className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "#c4704a" }}
                    >
                      <AlertTriangle size={12} />
                      Priority
                    </div>
                    <p
                      className="mb-3 text-[14px] leading-relaxed"
                      style={{ color: "#2c2418" }}
                    >
                      <span className="font-semibold">{atRiskCount} customer{atRiskCount !== 1 ? "s" : ""}</span>{" "}
                      {atRiskCount === 1 ? "is" : "are"} showing churn signals. I&apos;ve drafted personalized
                      win-back offers for each.
                    </p>

                    {/* Confidence + tools */}
                    <div className="mb-3 flex items-center gap-4">
                      <ConfidenceArc score={94} />
                      <div className="flex gap-1.5">
                        <ToolPill label="analyze_segments" index={0} />
                        <ToolPill label="predict_churn" index={1} />
                        <ToolPill label="draft_offers" index={2} />
                      </div>
                    </div>

                    {/* Approval actions */}
                    <div
                      className="rounded-lg p-3"
                      style={{
                        backgroundColor: "rgba(255,255,255,0.7)",
                        border: "1px solid rgba(0,0,0,0.05)",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white transition-all duration-150 hover:opacity-90"
                          style={{ backgroundColor: "#c4704a" }}
                        >
                          <CheckCircle2 size={13} />
                          Approve All
                          <span
                            className="ml-1 rounded px-1 py-0.5 text-[9px] font-normal"
                            style={{
                              backgroundColor: "rgba(255,255,255,0.2)",
                              fontFamily: "monospace",
                            }}
                          >
                            A
                          </span>
                        </button>
                        <button
                          className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-all duration-150"
                          style={{
                            backgroundColor: "rgba(0,0,0,0.04)",
                            color: "#2c2418",
                            border: "1px solid rgba(0,0,0,0.06)",
                          }}
                        >
                          <Eye size={13} />
                          Review Each
                        </button>
                        <button
                          className="rounded-lg px-3 py-2 text-xs transition-all duration-150"
                          style={{ color: "rgba(44,36,24,0.4)" }}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ---- Message 4: User message ---- */}
              <motion.div
                variants={messageVariants}
                className="flex justify-end"
              >
                <div
                  className="max-w-[480px] rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed"
                  style={{ backgroundColor: "#2c2418", color: "#faf8f5" }}
                >
                  Show me who&apos;s about to churn
                </div>
              </motion.div>

              {/* ---- Message 5: Tool pills + customer cards ---- */}
              <motion.div variants={messageVariants} className="flex gap-3">
                <div
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: "rgba(196,112,74,0.1)" }}
                >
                  <Sparkles size={13} style={{ color: "#c4704a" }} />
                </div>
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className="text-[11px] font-semibold"
                      style={{ color: "rgba(44,36,24,0.5)" }}
                    >
                      Allo Agent
                    </span>
                    <span
                      className="text-[9px]"
                      style={{ color: "rgba(44,36,24,0.25)" }}
                    >
                      {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="mb-2.5 flex gap-1.5">
                    <ToolPill label="query_segments" index={0} />
                    <ToolPill label="get_churn_risk" index={1} />
                  </div>

                  {atRiskCount > 0 ? (
                    <>
                      <p
                        className="mb-3 text-[14px] leading-relaxed"
                        style={{ color: "#2c2418" }}
                      >
                        I found{" "}
                        <span className="font-semibold">
                          {atRiskCount} at-risk customer{atRiskCount !== 1 ? "s" : ""}
                        </span>
                        . Here are representative examples:
                      </p>

                      {/* Customer risk cards — representative examples */}
                      <div className="flex flex-col gap-2">
                        <CustomerRiskCard
                          initials="SK"
                          name="Sarah K."
                          risk={94}
                          ltv="$2,400"
                          transition="Champion → At Risk"
                          daysAgo={67}
                        />
                        <CustomerRiskCard
                          initials="MR"
                          name="Mike R."
                          risk={87}
                          ltv="$1,800"
                          transition="Loyal → At Risk"
                          daysAgo={52}
                        />
                        <CustomerRiskCard
                          initials="LM"
                          name="Lisa M."
                          risk={82}
                          ltv="$3,200"
                          transition="Champion → At Risk"
                          daysAgo={48}
                        />
                      </div>

                      {/* Actions */}
                      <div className="mt-3 flex gap-2">
                        <button
                          className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white transition-all duration-150 hover:opacity-90"
                          style={{ backgroundColor: "#c4704a" }}
                        >
                          <Send size={12} />
                          Send Offers to All {atRiskCount}
                        </button>
                        <button
                          className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-all duration-150"
                          style={{
                            backgroundColor: "rgba(0,0,0,0.04)",
                            color: "#2c2418",
                            border: "1px solid rgba(0,0,0,0.06)",
                          }}
                        >
                          <Hash size={12} />
                          Create Segment
                        </button>
                      </div>
                    </>
                  ) : (
                    <p
                      className="mb-3 text-[14px] leading-relaxed"
                      style={{ color: "#2c2418" }}
                    >
                      No customers are currently at risk of churning. Your retention is looking healthy.
                    </p>
                  )}
                </div>
              </motion.div>

              {/* ---- Message 6: User message ---- */}
              <motion.div
                variants={messageVariants}
                className="flex justify-end"
              >
                <div
                  className="max-w-[480px] rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed"
                  style={{ backgroundColor: "#2c2418", color: "#faf8f5" }}
                >
                  Send Sarah a 20% off win-back on WhatsApp
                </div>
              </motion.div>

              {/* ---- Message 7: Agent action confirmation ---- */}
              <motion.div variants={messageVariants} className="flex gap-3">
                <div
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: "rgba(196,112,74,0.1)" }}
                >
                  <Sparkles size={13} style={{ color: "#c4704a" }} />
                </div>
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className="text-[11px] font-semibold"
                      style={{ color: "rgba(44,36,24,0.5)" }}
                    >
                      Allo Agent
                    </span>
                    <span
                      className="text-[9px]"
                      style={{ color: "rgba(44,36,24,0.25)" }}
                    >
                      {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="mb-2.5 flex gap-1.5">
                    <ToolPill label="create_discount" index={0} />
                    <ToolPill label="send_whatsapp" index={1} />
                  </div>
                  <p
                    className="mb-1 text-[14px] leading-relaxed"
                    style={{ color: "#2c2418" }}
                  >
                    Done. Created discount{" "}
                    <span
                      className="rounded px-1.5 py-0.5 text-[12px] font-medium"
                      style={{
                        backgroundColor: "rgba(107,122,47,0.08)",
                        color: "#6B7A2F",
                        fontFamily: "monospace",
                      }}
                    >
                      WINBACK-SARAH-20
                    </span>{" "}
                    (20% off, 7 days). Sent via WhatsApp with a personalized
                    message referencing her last purchase (
                    <span className="font-medium">Merino Wool Sweater</span>
                    ).
                  </p>

                  {/* Confirmation card */}
                  <div
                    className="mt-3 rounded-lg p-3"
                    style={{
                      backgroundColor: "rgba(107,122,47,0.04)",
                      border: "1px solid rgba(107,122,47,0.1)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        size={14}
                        style={{ color: "#6B7A2F" }}
                      />
                      <span
                        className="text-[12px] font-medium"
                        style={{ color: "#6B7A2F" }}
                      >
                        WhatsApp delivered &middot; Discount active
                      </span>
                    </div>
                  </div>

                  {/* Follow-up actions */}
                  <div className="mt-3 flex gap-2">
                    <button
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150"
                      style={{
                        backgroundColor: "rgba(0,0,0,0.04)",
                        color: "#2c2418",
                        border: "1px solid rgba(0,0,0,0.06)",
                      }}
                    >
                      <ExternalLink size={11} />
                      View Discount
                    </button>
                    <button
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150"
                      style={{
                        backgroundColor: "rgba(0,0,0,0.04)",
                        color: "#2c2418",
                        border: "1px solid rgba(0,0,0,0.06)",
                      }}
                    >
                      <Send size={11} />
                      Send to Mike &amp; Lisa Too
                    </button>
                  </div>
                </div>
              </motion.div>

              {/* ---- Typing indicator ---- */}
              <motion.div variants={messageVariants} className="ml-10">
                <TypingIndicator />
              </motion.div>

              <div ref={messagesEndRef} />
            </motion.div>
          </div>
        </div>

        {/* Input area */}
        <div
          className="shrink-0 px-6 pb-5 pt-2"
          style={{ borderTop: "1px solid rgba(0,0,0,0.04)" }}
        >
          <div className="mx-auto max-w-[800px]">
            {/* Suggestion chips */}
            <div className="mb-2.5 flex gap-1.5 overflow-x-auto">
              {suggestions.map((s) => (
                <button
                  key={s}
                  className="shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-all duration-150"
                  style={{
                    backgroundColor: "rgba(0,0,0,0.03)",
                    color: "rgba(44,36,24,0.55)",
                    border: "1px solid rgba(0,0,0,0.05)",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.backgroundColor =
                      "rgba(196,112,74,0.06)";
                    (e.target as HTMLElement).style.borderColor =
                      "rgba(196,112,74,0.15)";
                    (e.target as HTMLElement).style.color = "#c4704a";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.backgroundColor =
                      "rgba(0,0,0,0.03)";
                    (e.target as HTMLElement).style.borderColor =
                      "rgba(0,0,0,0.05)";
                    (e.target as HTMLElement).style.color =
                      "rgba(44,36,24,0.55)";
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Input field */}
            <div
              className="flex items-center gap-2 rounded-xl px-4 py-2.5"
              style={{
                backgroundColor: "rgba(255,255,255,0.8)",
                border: "1px solid rgba(0,0,0,0.07)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
              }}
            >
              <input
                type="text"
                placeholder="Ask the agent anything..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[rgba(44,36,24,0.3)]"
                style={{ color: "#2c2418" }}
                onFocus={(e) => {
                  const parent = e.target.parentElement!;
                  parent.style.borderColor = "rgba(196,112,74,0.3)";
                  parent.style.boxShadow =
                    "0 0 0 3px rgba(196,112,74,0.06)";
                }}
                onBlur={(e) => {
                  const parent = e.target.parentElement!;
                  parent.style.borderColor = "rgba(0,0,0,0.07)";
                  parent.style.boxShadow = "0 1px 3px rgba(0,0,0,0.02)";
                }}
              />
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[10px]"
                  style={{
                    color: "rgba(44,36,24,0.25)",
                    fontFamily: "monospace",
                  }}
                >
                  {inputValue.length > 0 ? `${inputValue.length}` : ""}
                </span>
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150"
                  style={{
                    backgroundColor: inputValue
                      ? "#c4704a"
                      : "rgba(0,0,0,0.04)",
                    color: inputValue ? "#fff" : "rgba(44,36,24,0.3)",
                  }}
                >
                  <ArrowRight size={14} />
                </button>
                <span
                  className="ml-0.5 text-[9px]"
                  style={{
                    color: "rgba(44,36,24,0.2)",
                    fontFamily: "monospace",
                  }}
                >
                  &#x23CE;
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Right sidebar                                                       */}
      {/* ----------------------------------------------------------------- */}
      <div
        className="flex h-full w-72 shrink-0 flex-col overflow-y-auto"
        style={{
          backgroundColor: "rgba(237,231,219,0.4)",
          borderLeft: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        {/* Live Activity */}
        <div className="p-4">
          <div
            className="mb-3 text-[10px] font-semibold uppercase tracking-widest"
            style={{
              color: "rgba(44,36,24,0.4)",
              fontFamily: "monospace",
            }}
          >
            Live Activity
          </div>
          <div className="flex flex-col gap-2.5">
            {liveActivityItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.08 }}
                  className="flex items-start gap-2.5"
                >
                  <div className="relative mt-0.5">
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: `${item.color}12`,
                      }}
                    >
                      <Icon size={11} style={{ color: item.color }} />
                    </div>
                    {i === 0 && (
                      <div className="absolute -right-0.5 -top-0.5">
                        <PulseDot color={item.color} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p
                      className="text-[12px] leading-snug"
                      style={{ color: "#2c2418" }}
                    >
                      {item.text}
                    </p>
                    <p
                      className="mt-0.5 text-[10px]"
                      style={{ color: "rgba(44,36,24,0.35)" }}
                    >
                      {item.time}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div
          className="mx-4"
          style={{
            height: "1px",
            backgroundColor: "rgba(0,0,0,0.06)",
          }}
        />

        {/* Active Conversations */}
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{
                color: "rgba(44,36,24,0.4)",
                fontFamily: "monospace",
              }}
            >
              Conversations
            </div>
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
              style={{
                backgroundColor: "#c4704a",
                color: "#fff",
              }}
            >
              {conversations.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {conversations.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors duration-150"
                style={{
                  backgroundColor: c.unread
                    ? "rgba(255,255,255,0.5)"
                    : "transparent",
                  border: c.unread
                    ? "1px solid rgba(0,0,0,0.04)"
                    : "1px solid transparent",
                  cursor: "pointer",
                }}
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{
                    backgroundColor: "rgba(196,112,74,0.1)",
                    color: "#c4704a",
                  }}
                >
                  {c.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="truncate text-[12px] font-medium"
                      style={{ color: "#2c2418" }}
                    >
                      {c.name}
                    </span>
                    {c.unread && <PulseDot color="#c4704a" />}
                    {c.escalated && (
                      <AlertTriangle
                        size={10}
                        style={{ color: "#c4704a" }}
                      />
                    )}
                  </div>
                  <p
                    className="truncate text-[11px]"
                    style={{ color: "rgba(44,36,24,0.45)" }}
                  >
                    {c.subject}
                  </p>
                </div>
                <ChevronRight
                  size={12}
                  style={{ color: "rgba(44,36,24,0.2)" }}
                />
              </div>
            ))}
          </div>
        </div>

        <div
          className="mx-4"
          style={{
            height: "1px",
            backgroundColor: "rgba(0,0,0,0.06)",
          }}
        />

        {/* Insights */}
        <div className="p-4">
          <div
            className="mb-3 text-[10px] font-semibold uppercase tracking-widest"
            style={{
              color: "rgba(44,36,24,0.4)",
              fontFamily: "monospace",
            }}
          >
            Insights
          </div>
          <div className="flex flex-col gap-2.5">
            {/* Revenue trend insight */}
            {revTrending ? (
              <div
                className="rounded-lg p-3"
                style={{
                  backgroundColor: "rgba(255,255,255,0.5)",
                  border: "1px solid rgba(0,0,0,0.04)",
                }}
              >
                <div className="mb-1.5 flex items-center gap-1.5">
                  {revTrending.direction === "down" ? (
                    <TrendingDown size={12} style={{ color: "#c4704a" }} />
                  ) : (
                    <TrendingUp size={12} style={{ color: "#6B7A2F" }} />
                  )}
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: revTrending.direction === "down" ? "#c4704a" : "#6B7A2F" }}
                  >
                    {revTrending.direction === "down" ? "Revenue Anomaly" : "Revenue Growing"}
                  </span>
                </div>
                <p
                  className="mb-2 text-[12px] leading-snug"
                  style={{ color: "rgba(44,36,24,0.7)" }}
                >
                  Revenue is{" "}
                  <span
                    className="font-semibold"
                    style={{ color: revTrending.direction === "down" ? "#c4704a" : "#6B7A2F" }}
                  >
                    {revTrending.direction === "down" ? "down" : "up"} {Math.abs(revTrending.pct)}%
                  </span>{" "}
                  vs 30-day average.
                </p>
                <button
                  className="flex items-center gap-1 text-[11px] font-medium transition-colors duration-150"
                  style={{ color: revTrending.direction === "down" ? "#c4704a" : "#6B7A2F" }}
                >
                  Investigate
                  <ChevronRight size={11} />
                </button>
              </div>
            ) : (
              <div
                className="rounded-lg p-3"
                style={{
                  backgroundColor: "rgba(255,255,255,0.5)",
                  border: "1px solid rgba(0,0,0,0.04)",
                }}
              >
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Sparkles size={12} style={{ color: "#6B7A2F" }} />
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: "#6B7A2F" }}
                  >
                    Revenue Steady
                  </span>
                </div>
                <p
                  className="text-[12px] leading-snug"
                  style={{ color: "rgba(44,36,24,0.7)" }}
                >
                  No significant revenue anomalies detected. Trends are within normal range.
                </p>
              </div>
            )}

            {/* Segment insight */}
            {segmentDist && segmentDist.length > 0 && (
              <div
                className="rounded-lg p-3"
                style={{
                  backgroundColor: "rgba(255,255,255,0.5)",
                  border: "1px solid rgba(0,0,0,0.04)",
                }}
              >
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Users size={12} style={{ color: "#6B7A2F" }} />
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: "#6B7A2F" }}
                  >
                    Segment Overview
                  </span>
                </div>
                <p
                  className="mb-2 text-[12px] leading-snug"
                  style={{ color: "rgba(44,36,24,0.7)" }}
                >
                  {segmentDist.length} active segments.{" "}
                  {atRiskCount > 0 && (
                    <>
                      <span className="font-semibold" style={{ color: "#c4704a" }}>
                        {atRiskCount} at-risk
                      </span>{" "}
                      customer{atRiskCount !== 1 ? "s" : ""} need attention.
                    </>
                  )}
                </p>
                <button
                  className="flex items-center gap-1 text-[11px] font-medium transition-colors duration-150"
                  style={{ color: "#6B7A2F" }}
                >
                  View Segments
                  <ChevronRight size={11} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
