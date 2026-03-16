"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Users,
  Mail,
  BarChart3,
  Settings,
  Search,
  ArrowRight,
  Check,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Sparkles,
  Hash,
  ShieldCheck,
  ChevronRight,
  Sun,
  Moon,
  LayoutDashboard,
  ListChecks,
  Layers,
  FileText,
  MousePointerClick,
  Brain,
  MessageSquare,
  Store,
  Activity,
  Target,
  Calendar,
  Play,
  Pause,
} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { trpc } from "@/lib/trpc";
import { useUser } from "@clerk/nextjs";
import { useCommandPalette } from "@/components/ui/CommandPalette";

// ---------------------------------------------------------------------------
// Theme definitions
// ---------------------------------------------------------------------------
const themes = {
  light: {
    bg: "#faf8f5",
    bgSecondary: "rgba(237,231,219,0.4)",
    cardBg: "rgba(255,255,255,0.7)",
    cardBorder: "rgba(0,0,0,0.05)",
    text: "#2c2418",
    textSecondary: "#9ca3af",
    textMuted: "#d1d5db",
    userBubble: "#2c2418",
    userBubbleText: "#faf8f5",
    inputBg: "#ffffff",
    inputBorder: "rgba(0,0,0,0.05)",
    toolPillBg: "rgba(107,122,47,0.08)",
    toolPillBorder: "rgba(107,122,47,0.15)",
    toolPillText: "#6B7A2F",
    riskBarBg: "rgba(0,0,0,0.06)",
    confidenceTrack: "rgba(0,0,0,0.06)",
    chipBorder: "rgba(0,0,0,0.05)",
    chipHoverBg: "rgba(196,112,74,0.03)",
    divider: "rgba(0,0,0,0.05)",
    sidebarBg: "rgba(237,231,219,0.4)",
    headerBg: "rgba(250,248,245,0.85)",
    navActiveBg: "#2c2418",
    navActiveText: "#faf8f5",
    navInactiveText: "#9ca3af",
    navHoverBg: "rgba(0,0,0,0.05)",
    accent: "#D4845A",
    positive: "#8FB87A",
    warning: "#D4AD4A",
    accentOld: "#c4704a",
    positiveOld: "#6B7A2F",
    warningOld: "#B8963E",
    textHalf: "rgba(44,36,24,0.5)",
    textQuarter: "rgba(44,36,24,0.25)",
    textLabel: "rgba(44,36,24,0.45)",
    textLight: "rgba(44,36,24,0.4)",
    textLighter: "rgba(44,36,24,0.35)",
    textSubtle: "rgba(44,36,24,0.3)",
    textFaintest: "rgba(44,36,24,0.2)",
    textBody: "rgba(44,36,24,0.7)",
    textChip: "rgba(44,36,24,0.55)",
    accentBgLight: "rgba(196,112,74,0.1)",
    accentBgFaint: "rgba(196,112,74,0.06)",
    btnBg: "rgba(0,0,0,0.04)",
    btnBorder: "rgba(0,0,0,0.06)",
    btnBgFaint: "rgba(0,0,0,0.03)",
    inputContainerBg: "rgba(255,255,255,0.8)",
    inputContainerBorder: "rgba(0,0,0,0.07)",
    inputShadow: "0 1px 3px rgba(0,0,0,0.02)",
    inputFocusBorder: "rgba(196,112,74,0.3)",
    inputFocusShadow: "0 0 0 3px rgba(196,112,74,0.06)",
    dividerAlt: "rgba(0,0,0,0.06)",
    dividerLight: "rgba(0,0,0,0.04)",
    sidebarCardBg: "rgba(255,255,255,0.5)",
    sidebarCardBorder: "rgba(0,0,0,0.04)",
    unreadBg: "rgba(255,255,255,0.5)",
    unreadBorder: "rgba(0,0,0,0.04)",
    confirmBg: "rgba(107,122,47,0.04)",
    confirmBorder: "rgba(107,122,47,0.1)",
    revenuePillBg: "rgba(107,122,47,0.08)",
    revenuePillBorder: "rgba(107,122,47,0.1)",
    revenuePillSubtext: "rgba(107,122,47,0.6)",
    codeBg: "rgba(107,122,47,0.08)",
    approvalBtnBg: "rgba(255,255,255,0.2)",
    blurValue: "blur(12px)",
    avatarBg: "rgba(44,36,24,0.08)",
    sidebarBorderRight: "rgba(0,0,0,0.05)",
  },
  dark: {
    bg: "#1A1815",
    bgSecondary: "rgba(40, 36, 30, 0.5)",
    cardBg: "rgba(40, 36, 30, 0.7)",
    cardBorder: "rgba(200, 180, 150, 0.12)",
    text: "#E8E2D8",
    textSecondary: "#A09888",
    textMuted: "#6B6358",
    userBubble: "#E8E2D8",
    userBubbleText: "#1A1815",
    inputBg: "rgba(40, 36, 30, 0.8)",
    inputBorder: "rgba(200, 180, 150, 0.12)",
    toolPillBg: "rgba(143, 184, 122, 0.1)",
    toolPillBorder: "rgba(143, 184, 122, 0.2)",
    toolPillText: "#8FB87A",
    riskBarBg: "rgba(200, 180, 150, 0.1)",
    confidenceTrack: "rgba(200, 180, 150, 0.1)",
    chipBorder: "rgba(200, 180, 150, 0.12)",
    chipHoverBg: "rgba(212, 132, 90, 0.08)",
    divider: "rgba(200, 180, 150, 0.08)",
    sidebarBg: "rgba(30, 27, 22, 0.8)",
    headerBg: "rgba(26, 24, 21, 0.9)",
    navActiveBg: "rgba(212, 132, 90, 0.15)",
    navActiveText: "#D4845A",
    navInactiveText: "#6B6358",
    navHoverBg: "rgba(200, 180, 150, 0.08)",
    accent: "#D4845A",
    positive: "#8FB87A",
    warning: "#D4AD4A",
    accentOld: "#D4845A",
    positiveOld: "#8FB87A",
    warningOld: "#D4AD4A",
    textHalf: "rgba(232,226,216,0.5)",
    textQuarter: "rgba(232,226,216,0.25)",
    textLabel: "rgba(232,226,216,0.45)",
    textLight: "rgba(232,226,216,0.4)",
    textLighter: "rgba(232,226,216,0.35)",
    textSubtle: "rgba(232,226,216,0.3)",
    textFaintest: "rgba(232,226,216,0.2)",
    textBody: "rgba(232,226,216,0.7)",
    textChip: "rgba(232,226,216,0.55)",
    accentBgLight: "rgba(212,132,90,0.12)",
    accentBgFaint: "rgba(212,132,90,0.08)",
    btnBg: "rgba(200,180,150,0.08)",
    btnBorder: "rgba(200,180,150,0.12)",
    btnBgFaint: "rgba(200,180,150,0.06)",
    inputContainerBg: "rgba(40,36,30,0.8)",
    inputContainerBorder: "rgba(200,180,150,0.12)",
    inputShadow: "0 1px 3px rgba(0,0,0,0.15)",
    inputFocusBorder: "rgba(212,132,90,0.4)",
    inputFocusShadow: "0 0 0 3px rgba(212,132,90,0.1)",
    dividerAlt: "rgba(200,180,150,0.1)",
    dividerLight: "rgba(200,180,150,0.06)",
    sidebarCardBg: "rgba(40,36,30,0.5)",
    sidebarCardBorder: "rgba(200,180,150,0.08)",
    unreadBg: "rgba(40,36,30,0.6)",
    unreadBorder: "rgba(200,180,150,0.08)",
    confirmBg: "rgba(143,184,122,0.06)",
    confirmBorder: "rgba(143,184,122,0.15)",
    revenuePillBg: "rgba(212,173,74,0.12)",
    revenuePillBorder: "rgba(212,173,74,0.2)",
    revenuePillSubtext: "rgba(212,173,74,0.6)",
    codeBg: "rgba(143,184,122,0.1)",
    approvalBtnBg: "rgba(0,0,0,0.2)",
    blurValue: "blur(20px) saturate(120%)",
    avatarBg: "rgba(232,226,216,0.1)",
    sidebarBorderRight: "rgba(200,180,150,0.08)",
  },
};

type ThemeTokens = typeof themes.light;

// ---------------------------------------------------------------------------
// Chat message type
// ---------------------------------------------------------------------------
interface InsightCard {
  label: string;
  value: string;
  description?: string;
  variant: "accent" | "success" | "warning";
  stats?: { label: string; value: string }[];
}

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: Date;
  toolCalls?: string[];
  highlights?: { label: string; value: string }[];
  suggestedFollowUps?: string[];
  action?: { intent: string; success: boolean; summary: string; created?: any } | null;
  insightCard?: InsightCard;
  actionLinks?: { label: string; href: string }[];
}

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
function PulseDot({ color }: { color: string }) {
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
// Time ago helper
// ---------------------------------------------------------------------------
function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Agent activity indicator (multi-step, matching AI panel)
// ---------------------------------------------------------------------------
const AGENT_STEPS = [
  "Reading your store data",
  "Analyzing customer segments",
  "Reasoning about the best approach",
  "Calling tools",
  "Generating content",
  "Processing results",
  "Composing response",
];

function AgentActivityIndicator({ t }: { t: ThemeTokens }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timings = [2, 4, 6, 9, 12, 16, 20];
    const newIdx = timings.findIndex((tt) => elapsed < tt);
    setStepIdx(newIdx === -1 ? AGENT_STEPS.length - 1 : newIdx);
    setCompletedSteps(timings.map((tt, i) => (elapsed >= tt ? i : -1)).filter((i) => i >= 0));
  }, [elapsed]);

  const currentStep = AGENT_STEPS[stepIdx] ?? AGENT_STEPS[AGENT_STEPS.length - 1]!;

  return (
    <div className="flex gap-2.5">
      <div
        className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: t.accentBgLight }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        >
          <Sparkles size={12} style={{ color: t.warningOld }} />
        </motion.div>
      </div>
      <div
        className="flex-1 min-w-0 pl-3"
        style={{ borderLeft: `2px solid ${t.warningOld}44` }}
      >
        {/* Completed steps */}
        <div className="space-y-1 mb-1.5">
          {completedSteps.map((idx) => (
            <div key={idx} className="flex items-center gap-2 text-[11px]" style={{ fontFamily: "monospace", color: t.textLight }}>
              <Check size={12} style={{ color: t.positiveOld }} />
              <span>{AGENT_STEPS[idx]}</span>
            </div>
          ))}
        </div>
        {/* Current step */}
        <div className="flex items-center gap-2 py-0.5">
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: t.warningOld }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
              />
            ))}
          </span>
          <span className="text-[12px]" style={{ fontFamily: "monospace", color: t.warningOld }}>
            {currentStep}...
          </span>
        </div>
        {/* Timer */}
        <div className="text-[10px] mt-1" style={{ fontFamily: "monospace", color: t.textFaintest }}>
          {elapsed}s elapsed
        </div>
      </div>
    </div>
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
  t,
}: {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  sparkData: number[];
  color: string;
  t: ThemeTokens;
}) {
  return (
    <div
      className="flex-1 rounded-lg px-4 py-3"
      style={{
        backgroundColor: t.cardBg,
        border: `1px solid ${t.cardBorder}`,
      }}
    >
      <div
        className="mb-1 text-[10px] font-medium uppercase tracking-wider"
        style={{ color: t.textLabel, fontFamily: "monospace" }}
      >
        {label}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div
            className="text-xl font-semibold"
            style={{ color: t.text }}
          >
            {value}
          </div>
          <div
            className="mt-0.5 text-[11px] font-medium"
            style={{ color: positive ? t.positiveOld : t.accentOld }}
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
// Nav items with routes — mirrors main Sidebar
// ---------------------------------------------------------------------------
const primaryNavItems = [
  { icon: Sparkles, label: "Agent", href: "/dashboard-c" },
  { icon: LayoutDashboard, label: "Home", href: "/dashboard" },
  { icon: ListChecks, label: "Actions", href: "/actions", showBadge: true },
  { icon: BarChart3, label: "Performance", href: "/analytics" },
] as const;

const secondaryNavItems = [
  { icon: Users, label: "Customers", href: "/customers" },
  { icon: Layers, label: "Segments", href: "/segments" },
  { icon: FileText, label: "Templates", href: "/templates" },
  { icon: Mail, label: "Campaigns", href: "/campaigns" },
  { icon: Zap, label: "Automations", href: "/automations" },
  { icon: MousePointerClick, label: "Forms", href: "/forms" },
  { icon: Brain, label: "Brand Voice", href: "/intelligence/brand" },
  { icon: MessageSquare, label: "Conversations", href: "/conversations" },
  { icon: Store, label: "Integrations", href: "/integrations" },
  { icon: Settings, label: "Settings", href: "/settings" },
] as const;

// ---------------------------------------------------------------------------
// Active conversations (mock -- no conversations API yet)
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
// Agent message bubble renderer — matches AlloAIPanel style
// ---------------------------------------------------------------------------
function AgentMessage({ msg, t }: { msg: ChatMessage; t: ThemeTokens }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2.5"
    >
      {/* Avatar — rounded-lg like AI panel */}
      <div
        className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: t.accentBgLight }}
      >
        <Sparkles size={12} style={{ color: t.accentOld }} />
      </div>
      {/* Content with left accent border */}
      <div
        className="flex-1 min-w-0 pl-3 rounded-xl rounded-bl-sm"
        style={{ borderLeft: `2px solid ${t.accentOld}33` }}
      >
        {/* Tool calls — green dot badges */}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {msg.toolCalls.map((tool, i) => (
              <motion.span
                key={`${tool}-${i}`}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: i * 0.08 }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]"
                style={{
                  fontFamily: "monospace",
                  backgroundColor: `${t.positiveOld}18`,
                  border: `1px solid ${t.positiveOld}33`,
                  color: t.positiveOld,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: t.positiveOld }}
                />
                {tool.replace(/_/g, " ")}
              </motion.span>
            ))}
          </div>
        )}

        {/* Highlight metric cards */}
        {msg.highlights && msg.highlights.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {msg.highlights.map((h) => (
              <div
                key={h.label}
                className="flex-1 min-w-[80px] rounded-xl px-3 py-2.5"
                style={{
                  backgroundColor: t.accentBgFaint,
                  border: `1px solid ${t.cardBorder}`,
                }}
              >
                <div
                  className="text-[10px] uppercase tracking-wider"
                  style={{ fontFamily: "monospace", color: t.textLabel }}
                >
                  {h.label}
                </div>
                <div
                  className="text-[15px] font-bold mt-0.5"
                  style={{ fontFamily: "monospace", color: t.accentOld }}
                >
                  {h.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Markdown-rendered content */}
        <div className="text-[13px] leading-[1.65]" style={{ color: t.text }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ children }) => (
                <h2
                  className="text-[14px] font-semibold mt-3 mb-1.5 first:mt-0"
                  style={{ color: t.text, fontFamily: "serif" }}
                >
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3
                  className="text-[13px] font-semibold mt-2.5 mb-1 first:mt-0"
                  style={{ color: t.text, fontFamily: "serif" }}
                >
                  {children}
                </h3>
              ),
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => (
                <strong className="font-semibold" style={{ color: t.text }}>
                  {children}
                </strong>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>
              ),
              li: ({ children }) => <li className="text-[13px]">{children}</li>,
              table: ({ children }) => (
                <div
                  className="overflow-x-auto my-2.5 rounded-lg"
                  style={{ border: `1px solid ${t.cardBorder}` }}
                >
                  <table className="w-full text-[12px]" style={{ fontFamily: "monospace" }}>
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead style={{ backgroundColor: t.bgSecondary }}>{children}</thead>
              ),
              th: ({ children }) => (
                <th
                  className="px-3 py-2 text-left font-semibold text-[11px] uppercase tracking-wider"
                  style={{ color: t.textLabel, borderBottom: `1px solid ${t.cardBorder}` }}
                >
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td
                  className="px-3 py-2"
                  style={{ color: t.text, borderBottom: `1px solid ${t.cardBorder}44` }}
                >
                  {children}
                </td>
              ),
              tr: ({ children }) => <tr>{children}</tr>,
              code: ({ children, className }) => {
                const isInline = !className;
                return isInline ? (
                  <code
                    className="px-1.5 py-0.5 rounded-md text-[12px]"
                    style={{
                      fontFamily: "monospace",
                      backgroundColor: t.accentBgFaint,
                      color: t.accentOld,
                    }}
                  >
                    {children}
                  </code>
                ) : (
                  <code
                    className="block p-3 rounded-lg text-[12px] overflow-x-auto mb-2"
                    style={{
                      fontFamily: "monospace",
                      backgroundColor: t.bgSecondary,
                      color: t.text,
                    }}
                  >
                    {children}
                  </code>
                );
              },
              blockquote: ({ children }) => (
                <blockquote
                  className="pl-3 my-2 italic"
                  style={{
                    borderLeft: `2px solid ${t.accentOld}`,
                    color: t.textSecondary,
                  }}
                >
                  {children}
                </blockquote>
              ),
            }}
          >
            {msg.content}
          </ReactMarkdown>
        </div>

        {/* Action result — insight card */}
        {msg.action && msg.action.success && (
          <div
            className="rounded-xl p-3.5 mt-2.5 mb-1"
            style={{
              backgroundColor: t.confirmBg,
              border: `1px solid ${t.confirmBorder}`,
            }}
          >
            <div
              className="text-[10px] uppercase tracking-wider mb-1.5"
              style={{ fontFamily: "monospace", color: t.positiveOld }}
            >
              {msg.action.intent?.replace(/_/g, " ") || "Action Complete"}
            </div>
            {msg.action.summary && (
              <div className="text-[11px] leading-relaxed" style={{ color: t.textBody }}>
                {msg.action.summary}
              </div>
            )}
          </div>
        )}

        {/* Insight card */}
        {msg.insightCard && (
          <div
            className="rounded-xl p-3.5 mt-2.5 mb-1"
            style={{
              backgroundColor: msg.insightCard.variant === "success" ? t.confirmBg : t.accentBgFaint,
              border: `1px solid ${msg.insightCard.variant === "success" ? t.confirmBorder : t.cardBorder}`,
            }}
          >
            <div
              className="text-[10px] uppercase tracking-wider mb-1.5"
              style={{
                fontFamily: "monospace",
                color: msg.insightCard.variant === "success" ? t.positiveOld : t.accentOld,
              }}
            >
              {msg.insightCard.label}
            </div>
            {msg.insightCard.value && (
              <div className="text-[14px] font-semibold" style={{ fontFamily: "monospace", color: t.text }}>
                {msg.insightCard.value}
              </div>
            )}
            {msg.insightCard.description && (
              <div className="text-[11px] mt-1.5 leading-relaxed" style={{ color: t.textBody }}>
                {msg.insightCard.description}
              </div>
            )}
            {msg.insightCard.stats && (
              <div className="flex gap-5 mt-2">
                {msg.insightCard.stats.map((stat) => (
                  <div key={stat.label}>
                    <div
                      className="text-lg font-bold"
                      style={{
                        fontFamily: "monospace",
                        color: msg.insightCard!.variant === "success" ? t.positiveOld : t.accentOld,
                      }}
                    >
                      {stat.value}
                    </div>
                    <div className="text-[10px]" style={{ fontFamily: "monospace", color: t.textLabel }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action links — View Campaign, View Template, etc. */}
        {msg.actionLinks && msg.actionLinks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {msg.actionLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] transition-colors"
                style={{
                  fontFamily: "monospace",
                  backgroundColor: t.accentBgFaint,
                  border: `1px solid ${t.cardBorder}`,
                  color: t.accentOld,
                }}
              >
                {link.label}
                <ArrowRight size={11} />
              </Link>
            ))}
          </div>
        )}

        {/* Follow-up suggestions */}
        {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
          <div className="mt-3">
            <div
              className="text-[10px] uppercase tracking-wider mb-2"
              style={{ fontFamily: "monospace", color: t.textLight }}
            >
              Follow up
            </div>
            <div className="flex flex-wrap gap-1.5">
              {msg.suggestedFollowUps.map((s, i) => (
                <button
                  key={i}
                  className="px-3 py-1.5 rounded-full text-[11px] transition-all text-left"
                  style={{
                    fontFamily: "monospace",
                    backgroundColor: t.accentBgFaint,
                    border: `1px solid ${t.cardBorder}`,
                    color: t.accentOld,
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.borderColor = `${t.accentOld}88`;
                    (e.target as HTMLElement).style.boxShadow = `0 0 8px ${t.accentOld}22`;
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.borderColor = t.cardBorder;
                    (e.target as HTMLElement).style.boxShadow = "none";
                  }}
                  data-followup={s}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Timestamp */}
        <div
          className="text-[10px] mt-1.5"
          style={{ fontFamily: "monospace", color: t.textFaintest }}
        >
          {timeAgo(msg.timestamp)}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// User message bubble renderer — matches AlloAIPanel style
// ---------------------------------------------------------------------------
function UserMessage({ msg, t }: { msg: ChatMessage; t: ThemeTokens }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-end"
    >
      <div className="max-w-[85%]">
        <div
          className="px-3.5 py-2.5 rounded-xl rounded-br-sm text-[13px] leading-[1.6]"
          style={{ backgroundColor: t.userBubble, color: t.userBubbleText }}
        >
          {msg.content}
        </div>
        <div
          className="text-[10px] mt-1 text-right"
          style={{ fontFamily: "monospace", color: t.textFaintest }}
        >
          {timeAgo(msg.timestamp)}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------
export default function DashboardC() {
  const [inputValue, setInputValue] = useState("");
  const [isDark, setIsDark] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatId, setChatId] = useState<string | undefined>();
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const commandPalette = useCommandPalette();

  const t = isDark ? themes.dark : themes.light;

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

  const { data: activationData } = (trpc.stores.activationStatus as any).useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone, refetchInterval: 30000 },
  ) as { data: any | undefined };
  const pendingCount = onboardingDone ? (activationData?.context?.pendingActions ?? 0) : 0;

  const { data: programs } = (trpc.automations.list as any).useQuery(
    storeId ? { storeId } : undefined,
    { enabled: !!storeId && onboardingDone },
  ) as { data: { id: string; name: string; description: string | null; programType: string; status: string }[] | undefined };

  const { data: tokenUsage } = (trpc.dashboard.tokenUsage as any).useQuery(undefined, {
    enabled: onboardingDone,
  }) as { data: { totalInputTokens: number; totalOutputTokens: number; totalCalls: number; totalCost: number } | undefined };

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
        color: t.positiveOld,
      });
    if (hasBrand)
      items.push({
        icon: Hash,
        text: `Brand voice analyzed${brandProfile?.brandName ? ` for ${brandProfile.brandName}` : ""}`,
        time: "Recently",
        color: t.warningOld,
      });
    if (hasSyncedData)
      items.push({
        icon: Users,
        text: `Segmented ${totalCustomers.toLocaleString()} customers into ${segmentDist?.length ?? 0} groups`,
        time: "Recently",
        color: t.positiveOld,
      });
    if (aiCalls > 0)
      items.push({
        icon: ShieldCheck,
        text: `${aiCalls} AI actions performed`,
        time: "Recently",
        color: t.accentOld,
      });
    if (items.length === 0)
      items.push({
        icon: Sparkles,
        text: "Agent is standing by",
        time: "Now",
        color: t.positiveOld,
      });
    return items;
  }, [automationCount, hasBrand, brandProfile, hasSyncedData, totalCustomers, segmentDist, aiCalls, t]);

  // --- Seed the initial greeting message once data is ready ---
  const hasSeedRef = useRef(false);
  useEffect(() => {
    if (hasSeedRef.current || storesLoading || !store) return;
    hasSeedRef.current = true;

    const greeting = getGreeting();
    let content = `${greeting}, ${firstName}. `;
    if (aiCalls > 0) {
      content += `I performed ${aiCalls} actions`;
      if (aiRevenue > 0) content += ` and drove $${aiRevenue.toLocaleString()} in AI-attributed revenue`;
      content += ".";
    } else {
      content += "Your retention system is active. Ask me anything about your customers, campaigns, or store performance.";
    }
    if (atRiskCount > 0) {
      content += `\n\n${atRiskCount} customer${atRiskCount !== 1 ? "s" : ""} ${atRiskCount === 1 ? "is" : "are"} showing churn signals. I can help you draft win-back offers for them.`;
    }

    setMessages([
      {
        id: "seed-greeting",
        role: "agent",
        content,
        timestamp: new Date(),
        suggestedFollowUps: [
          "Win-back campaigns",
          "Churn overview",
          "Welcome series",
          "Revenue analysis",
          "Top segments",
        ],
      },
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storesLoading, !!store, firstName, aiCalls, aiRevenue, atRiskCount]);

  // --- Chat mutation --- (extracts insightCard + actionLinks like AlloAIPanel)
  const chatMutation = (trpc.ai.chat as any).useMutation({
    onSuccess: (data: any) => {
      setChatId(data.chatId);

      // Build actionLinks from created resources
      const actionLinks: { label: string; href: string }[] = [];
      if (data.action?.created?.automationId) {
        actionLinks.push({ label: "View Automation", href: `/automations/${data.action.created.automationId}` });
      }
      if (data.action?.created?.campaignId) {
        actionLinks.push({ label: "View Campaign", href: "/campaigns" });
      }
      if (data.action?.created?.templateIds?.length && !data.action?.created?.automationId) {
        actionLinks.push({ label: "View Template", href: `/templates/${data.action.created.templateIds[0]}/edit` });
      }
      if (data.action?.created?.segmentId) {
        actionLinks.push({ label: "View Segment", href: "/segments" });
      }
      // Extract from tool calls
      if (data.toolCalls?.includes("get_automation_details") || data.toolCalls?.includes("modify_automation")) {
        const autoMatch = data.reply?.match(/automations?\/([a-z0-9-]+)/i);
        if (autoMatch) actionLinks.push({ label: "View Automation", href: `/automations/${autoMatch[1]}` });
        else if (!actionLinks.some((l: any) => l.href.startsWith("/automations")))
          actionLinks.push({ label: "View Automations", href: "/automations" });
      }

      // Build insightCard for successful actions
      let insightCard: InsightCard | undefined;
      if (data.action?.success) {
        const stats: { label: string; value: string }[] = [];
        if (data.action.created?.automationId) stats.push({ label: "Automation", value: "Created" });
        if (data.action.created?.campaignId) stats.push({ label: "Campaign", value: "Created" });
        if (data.action.created?.templateIds?.length) stats.push({ label: "Templates", value: `${data.action.created.templateIds.length}` });
        if (data.action.created?.segmentId) stats.push({ label: "Segment", value: "Created" });
        if (stats.length > 0) {
          insightCard = {
            label: (data.action.intent || "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
            value: "",
            variant: "success",
            stats,
          };
        }
      }

      setMessages((prev: ChatMessage[]) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "agent" as const,
          content: data.reply as string,
          timestamp: new Date(),
          toolCalls: data.toolCalls as string[] | undefined,
          highlights: data.highlights as { label: string; value: string }[] | undefined,
          suggestedFollowUps: data.suggestedFollowUps as string[] | undefined,
          action: data.action as ChatMessage["action"],
          insightCard,
          actionLinks: actionLinks.length > 0 ? actionLinks : undefined,
        },
      ]);
      setIsTyping(false);
    },
    onError: (err: any) => {
      setIsTyping(false);
      setMessages((prev: ChatMessage[]) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "agent" as const,
          content: `Sorry, I encountered an error: ${err.message}. Please try again.`,
          timestamp: new Date(),
        },
      ]);
    },
  }) as { mutate: (input: { storeId: string; message: string; chatId?: string; history: { role: "user" | "assistant"; content: string }[] }) => void };

  // --- Send message handler ---
  const handleSend = useCallback(
    (text?: string) => {
      const msg = (text || inputValue).trim();
      if (!msg || !storeId || isTyping) return;

      setInputValue("");
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: msg,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);

      const history = messages.map((m) => ({
        role: (m.role === "agent" ? "assistant" : "user") as "user" | "assistant",
        content: m.content,
      }));

      chatMutation.mutate({
        storeId,
        message: msg,
        chatId,
        history,
      });
    },
    [inputValue, storeId, isTyping, chatId, messages, chatMutation],
  );

  // --- Key handler for Enter ---
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // --- Scroll to bottom on new messages ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // --- Handle follow-up click (from agent message buttons) ---
  const handleFollowUpClick = useCallback(
    (e: React.MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-followup]");
      if (target) {
        const text = target.getAttribute("data-followup");
        if (text) handleSend(text);
      }
    },
    [handleSend],
  );

  // Sparkline data from time-series
  const revenueSparkData = toSparkValues((revenueSeries as any)?.points);
  const customerSparkData = toSparkValues((customerSeries as any)?.points);

  // Suggestion chips — show from latest agent message or defaults
  const currentSuggestions = useMemo(() => {
    const lastAgent = [...messages].reverse().find((m) => m.role === "agent" && m.suggestedFollowUps?.length);
    return lastAgent?.suggestedFollowUps ?? ["Win-back campaigns", "Churn overview", "Welcome series", "Revenue analysis", "Top segments"];
  }, [messages]);

  // --- Loading state ---
  if (storesLoading) {
    return (
      <div
        className="fixed inset-0 z-40 flex items-center justify-center"
        style={{ backgroundColor: t.bg }}
      >
        <div
          className="w-6 h-6 rounded-full animate-spin"
          style={{
            border: `2px solid ${t.textMuted}`,
            borderTopColor: t.textSecondary,
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex w-full overflow-hidden"
      style={{
        backgroundColor: t.bg,
        transition: "background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease",
      }}
    >
      {/* ----------------------------------------------------------------- */}
      {/* Left sidebar — full nav with labels                                 */}
      {/* ----------------------------------------------------------------- */}
      <aside
        className="relative flex h-full w-[200px] shrink-0 flex-col"
        style={{
          backgroundColor: t.sidebarBg,
          borderRight: `1px solid ${t.sidebarBorderRight}`,
          transition: "background-color 0.3s ease, border-color 0.3s ease",
        }}
      >
        {/* Logo */}
        <div className="px-4 py-4" style={{ borderBottom: `1px solid ${t.sidebarBorderRight}` }}>
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold"
              style={{ background: `linear-gradient(135deg, ${t.accentOld} 0%, ${t.warningOld} 100%)`, color: "#fff" }}
            >
              A
            </div>
            <div>
              <div className="text-[13px] font-bold" style={{ color: t.text, fontFamily: "serif", letterSpacing: "-0.3px" }}>
                AlloHQ
              </div>
              <div className="text-[8px] uppercase tracking-[0.8px]" style={{ fontFamily: "monospace", color: t.textLight }}>
                AI Retention
              </div>
            </div>
          </Link>
        </div>

        {/* Primary nav */}
        <nav className="px-2 pt-3 pb-1 space-y-0.5">
          {primaryNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === "/dashboard-c";
            return (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] transition-all"
                style={{
                  fontFamily: "monospace",
                  backgroundColor: isActive ? t.accentBgLight : "transparent",
                  color: isActive ? t.accentOld : t.textLight,
                  fontWeight: isActive ? 600 : 400,
                  borderLeft: isActive ? `3px solid ${t.accentOld}` : "3px solid transparent",
                }}
              >
                <Icon size={15} />
                <span className="flex-1">{item.label}</span>
                {"showBadge" in item && item.showBadge && pendingCount > 0 && (
                  <span
                    className="min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-bold"
                    style={{ backgroundColor: t.accentOld, color: "#fff" }}
                  >
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-4 my-1" style={{ height: "1px", backgroundColor: t.sidebarBorderRight }} />

        {/* Secondary nav */}
        <nav className="px-2 py-1 space-y-0.5 flex-1 overflow-y-auto">
          {secondaryNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[11px] transition-all"
                style={{
                  fontFamily: "monospace",
                  color: t.textLight,
                  borderLeft: "3px solid transparent",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = t.navHoverBg; (e.currentTarget as HTMLElement).style.color = t.text; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = t.textLight; }}
              >
                <Icon size={13} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="px-3 py-3" style={{ borderTop: `1px solid ${t.sidebarBorderRight}` }}>
          <div className="flex items-center gap-2.5 px-2">
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt="" className="w-7 h-7 rounded-full" />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ backgroundColor: t.avatarBg, color: t.text, fontFamily: "monospace" }}
              >
                {firstName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold truncate" style={{ fontFamily: "monospace", color: t.text }}>
                {user?.fullName || firstName}
              </p>
              <p className="text-[9px] truncate" style={{ fontFamily: "monospace", color: t.textLight }}>
                {user?.emailAddresses[0]?.emailAddress || ""}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ----------------------------------------------------------------- */}
      {/* Main conversation area                                             */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div
          className="flex h-13 shrink-0 items-center justify-between px-6"
          style={{
            borderBottom: `1px solid ${t.cardBorder}`,
            height: "52px",
            backgroundColor: t.headerBg,
            backdropFilter: t.blurValue,
            transition: "background-color 0.3s ease, border-color 0.3s ease",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles size={15} style={{ color: t.accentOld }} />
              <span className="text-sm font-semibold" style={{ color: t.text }}>
                Allo Agent
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <PulseDot color={t.positive} />
              <span className="text-[11px] font-medium" style={{ color: t.positiveOld }}>
                Active
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1"
              style={{
                backgroundColor: t.revenuePillBg,
                border: `1px solid ${t.revenuePillBorder}`,
              }}
            >
              <span className="text-xs font-semibold" style={{ color: t.positiveOld }}>
                {aiRevenue > 0 ? `$${aiRevenue.toLocaleString()}` : "$0"}
              </span>
              <span className="text-[10px]" style={{ color: t.revenuePillSubtext }}>
                AI revenue
              </span>
            </div>
            {/* Theme toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: t.textSecondary, backgroundColor: isDark ? "rgba(200,180,150,0.08)" : "rgba(0,0,0,0.03)" }}
              title={isDark ? "Switch to light" : "Switch to dark"}
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            {/* Command Palette trigger */}
            <button
              onClick={commandPalette.open}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-150"
              style={{
                backgroundColor: t.btnBgFaint,
                color: t.textHalf,
                border: `1px solid ${t.btnBorder}`,
              }}
            >
              <Search size={12} />
              <span
                className="rounded px-1 py-0.5 text-[10px]"
                style={{
                  backgroundColor: t.btnBg,
                  fontFamily: "monospace",
                }}
              >
                &#8984;K
              </span>
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ backgroundColor: t.bg, transition: "background-color 0.3s ease" }}
          onClick={handleFollowUpClick}
        >
          <div className="mx-auto max-w-[640px] px-6 py-6">
            <div className="flex flex-col gap-6">
              {/* KPI cards — always visible at top */}
              <div className="grid grid-cols-4 gap-2.5">
                <KpiCard
                  label="AI Revenue"
                  value={`$${aiRevenue.toLocaleString()}`}
                  delta={revenueDelta.label}
                  positive={revenueDelta.pct >= 0}
                  sparkData={revenueSparkData.length >= 2 ? revenueSparkData : [0, 0]}
                  color={t.positiveOld}
                  t={t}
                />
                <KpiCard
                  label="Customers"
                  value={totalCustomers.toLocaleString()}
                  delta={customerDelta.label}
                  positive={customerDelta.pct >= 0}
                  sparkData={customerSparkData.length >= 2 ? customerSparkData : [0, 0]}
                  color={t.positiveOld}
                  t={t}
                />
                <KpiCard
                  label="At Risk"
                  value={atRiskCount.toString()}
                  delta={atRiskCount > 0 ? "needs attention" : "all clear"}
                  positive={atRiskCount === 0}
                  sparkData={[0, 0]}
                  color={t.warningOld}
                  t={t}
                />
                <KpiCard
                  label="Agent Actions"
                  value={aiCalls.toString()}
                  delta={aiCalls > 0 ? `$${aiCost.toFixed(2)} cost` : "no actions yet"}
                  positive={aiCalls > 0}
                  sparkData={[0, 0]}
                  color={t.accentOld}
                  t={t}
                />
              </div>

              {/* Dynamic messages */}
              {messages.map((msg) =>
                msg.role === "agent" ? (
                  <AgentMessage key={msg.id} msg={msg} t={t} />
                ) : (
                  <UserMessage key={msg.id} msg={msg} t={t} />
                ),
              )}

              {/* Typing indicator */}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="ml-10"
                >
                  <AgentActivityIndicator t={t} />
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Input area */}
        <div
          className="shrink-0 px-6 pb-5 pt-2"
          style={{
            borderTop: `1px solid ${t.dividerLight}`,
            backgroundColor: t.bg,
            transition: "background-color 0.3s ease, border-color 0.3s ease",
          }}
        >
          <div className="mx-auto max-w-[640px]">
            {/* Suggestion chips — accent monospace style matching AI panel */}
            {!isTyping && currentSuggestions.length > 0 && (
              <div className="mb-2.5">
                <div
                  className="text-[10px] uppercase tracking-wider mb-2"
                  style={{ fontFamily: "monospace", color: t.textLight }}
                >
                  Suggested
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {currentSuggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSend(s)}
                      className="px-3 py-1.5 rounded-full text-[11px] transition-all"
                      style={{
                        fontFamily: "monospace",
                        backgroundColor: t.accentBgFaint,
                        border: `1px solid ${t.cardBorder}`,
                        color: t.accentOld,
                      }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLElement).style.borderColor = `${t.accentOld}88`;
                        (e.target as HTMLElement).style.boxShadow = `0 0 8px ${t.accentOld}22`;
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLElement).style.borderColor = t.cardBorder;
                        (e.target as HTMLElement).style.boxShadow = "none";
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input field — rounded pill matching AI panel */}
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                placeholder={isTyping ? "Allo is thinking..." : "Ask the agent anything..."}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isTyping}
                className="w-full pl-4 pr-12 py-3 rounded-[20px] text-[13px] outline-none transition-all disabled:opacity-50"
                style={{
                  backgroundColor: t.inputContainerBg,
                  border: `1px solid ${t.inputContainerBorder}`,
                  color: t.text,
                  boxShadow: t.inputShadow,
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = t.inputFocusBorder;
                  e.target.style.boxShadow = `0 0 0 1px ${t.accentOld}44`;
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = t.inputContainerBorder;
                  e.target.style.boxShadow = t.inputShadow;
                }}
              />
              <button
                onClick={() => handleSend()}
                disabled={isTyping || !inputValue.trim()}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150 disabled:opacity-30"
                style={{
                  backgroundColor: inputValue.trim() ? t.accentOld : "transparent",
                  color: inputValue.trim() ? "#fff" : t.textSubtle,
                }}
              >
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Right sidebar — verbose with real data                               */}
      {/* ----------------------------------------------------------------- */}
      <div
        className="flex h-full w-[340px] shrink-0 flex-col overflow-y-auto"
        style={{
          backgroundColor: t.sidebarBg,
          borderLeft: `1px solid ${t.sidebarBorderRight}`,
          transition: "background-color 0.3s ease, border-color 0.3s ease",
        }}
      >
        {/* ---- Daily Briefing ---- */}
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Calendar size={12} style={{ color: t.accentOld }} />
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: t.textLight, fontFamily: "monospace" }}>
              Daily Briefing
            </span>
          </div>
          <div className="rounded-xl p-3.5" style={{ backgroundColor: t.sidebarCardBg, border: `1px solid ${t.sidebarCardBorder}` }}>
            <p className="text-[12px] leading-relaxed" style={{ color: t.textBody }}>
              {aiCalls > 0 ? (
                <>
                  Your AI agent performed <span className="font-semibold" style={{ color: t.text }}>{aiCalls} actions</span> today
                  {aiRevenue > 0 && <>, driving <span className="font-semibold" style={{ color: t.positiveOld }}>${aiRevenue.toLocaleString()}</span> in attributed revenue</>}.
                  {aiCost > 0 && <> Total AI cost: <span style={{ fontFamily: "monospace" }}>${aiCost.toFixed(2)}</span>.</>}
                </>
              ) : (
                <>Your retention system is active and monitoring <span className="font-semibold" style={{ color: t.text }}>{totalCustomers.toLocaleString()}</span> customers.</>
              )}
            </p>
            {atRiskCount > 0 && (
              <div className="mt-2 flex items-center gap-1.5">
                <AlertTriangle size={11} style={{ color: t.accentOld }} />
                <span className="text-[11px] font-semibold" style={{ color: t.accentOld }}>
                  {atRiskCount} customer{atRiskCount !== 1 ? "s" : ""} at churn risk
                </span>
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <Link
                href="/analytics"
                className="px-2.5 py-1 rounded-full text-[10px] transition-colors"
                style={{ fontFamily: "monospace", backgroundColor: t.accentBgFaint, border: `1px solid ${t.cardBorder}`, color: t.accentOld }}
              >
                View Performance
              </Link>
              {atRiskCount > 0 && (
                <button
                  onClick={() => handleSend("Show me at-risk customers and create a win-back campaign")}
                  className="px-2.5 py-1 rounded-full text-[10px] transition-colors"
                  style={{ fontFamily: "monospace", backgroundColor: t.accentBgFaint, border: `1px solid ${t.cardBorder}`, color: t.accentOld }}
                >
                  Win-back Plan
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mx-4" style={{ height: "1px", backgroundColor: t.dividerAlt }} />

        {/* ---- Customer Segments ---- */}
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target size={12} style={{ color: t.positiveOld }} />
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: t.textLight, fontFamily: "monospace" }}>
                Customer Segments
              </span>
            </div>
            <Link
              href="/segments"
              className="text-[10px]"
              style={{ fontFamily: "monospace", color: t.accentOld }}
            >
              View all
            </Link>
          </div>
          {segmentDist && segmentDist.length > 0 ? (
            <div className="space-y-1.5">
              {segmentDist.slice(0, 6).map((seg) => {
                const isRisk = seg.segment === "At Risk" || seg.segment === "Hibernating" || seg.segment === "Lost";
                const barColor = isRisk ? t.accentOld : seg.segment === "Champions" || seg.segment === "Loyal" ? t.positiveOld : t.warningOld;
                const barPct = totalCustomers > 0 ? Math.round((seg.customerCount / totalCustomers) * 100) : 0;
                return (
                  <div key={seg.segment} className="rounded-lg px-3 py-2" style={{ backgroundColor: t.sidebarCardBg, border: `1px solid ${t.sidebarCardBorder}` }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium" style={{ color: t.text }}>{seg.segment}</span>
                      <span className="text-[11px] font-semibold" style={{ fontFamily: "monospace", color: isRisk ? t.accentOld : t.text }}>
                        {seg.customerCount.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-1 w-full rounded-full" style={{ backgroundColor: t.riskBarBg }}>
                      <div className="h-1 rounded-full transition-all" style={{ backgroundColor: barColor, width: `${Math.max(barPct, 2)}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[9px]" style={{ fontFamily: "monospace", color: t.textLighter }}>{barPct}%</span>
                      <span className="text-[9px]" style={{ fontFamily: "monospace", color: t.textLighter }}>
                        ${Math.round(seg.totalRevenue).toLocaleString()} rev
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px]" style={{ color: t.textLight }}>Connect a store to see segments.</p>
          )}
        </div>

        <div className="mx-4" style={{ height: "1px", backgroundColor: t.dividerAlt }} />

        {/* ---- Automations ---- */}
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={12} style={{ color: t.warningOld }} />
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: t.textLight, fontFamily: "monospace" }}>
                Automations
              </span>
            </div>
            <Link
              href="/automations"
              className="text-[10px]"
              style={{ fontFamily: "monospace", color: t.accentOld }}
            >
              Manage
            </Link>
          </div>
          {programs && programs.length > 0 ? (
            <div className="space-y-1.5">
              {programs.slice(0, 5).map((prog) => {
                const isActive = prog.status === "active";
                const isRecommended = prog.status === "recommended";
                return (
                  <Link
                    key={prog.id}
                    href={`/automations/${prog.id}`}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors"
                    style={{ backgroundColor: t.sidebarCardBg, border: `1px solid ${t.sidebarCardBorder}` }}
                  >
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: isActive ? `${t.positiveOld}18` : isRecommended ? `${t.warningOld}18` : `${t.textMuted}18` }}
                    >
                      {isActive ? <Play size={9} style={{ color: t.positiveOld }} /> : isRecommended ? <Sparkles size={9} style={{ color: t.warningOld }} /> : <Pause size={9} style={{ color: t.textMuted }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate" style={{ color: t.text }}>{prog.name}</p>
                      <p className="text-[9px] capitalize" style={{ fontFamily: "monospace", color: isActive ? t.positiveOld : isRecommended ? t.warningOld : t.textLight }}>
                        {prog.status}
                      </p>
                    </div>
                    <ChevronRight size={10} style={{ color: t.textFaintest }} />
                  </Link>
                );
              })}
              {programs.length > 5 && (
                <Link
                  href="/automations"
                  className="block text-center text-[10px] py-1.5"
                  style={{ fontFamily: "monospace", color: t.accentOld }}
                >
                  +{programs.length - 5} more
                </Link>
              )}
            </div>
          ) : (
            <div className="rounded-lg p-3" style={{ backgroundColor: t.sidebarCardBg, border: `1px solid ${t.sidebarCardBorder}` }}>
              <p className="text-[11px]" style={{ color: t.textLight }}>No automations yet.</p>
              <button
                onClick={() => handleSend("Set up retention automations for my store")}
                className="mt-2 px-2.5 py-1 rounded-full text-[10px] transition-colors"
                style={{ fontFamily: "monospace", backgroundColor: t.accentBgFaint, border: `1px solid ${t.cardBorder}`, color: t.accentOld }}
              >
                Create Automations
              </button>
            </div>
          )}
        </div>

        <div className="mx-4" style={{ height: "1px", backgroundColor: t.dividerAlt }} />

        {/* ---- Agent Activity ---- */}
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Activity size={12} style={{ color: t.positiveOld }} />
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: t.textLight, fontFamily: "monospace" }}>
              Agent Activity
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {liveActivityItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={i}
                  initial={false}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-2.5"
                >
                  <div className="relative mt-0.5">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: `${item.color}15` }}>
                      <Icon size={10} style={{ color: item.color }} />
                    </div>
                    {i === 0 && (
                      <div className="absolute -right-0.5 -top-0.5">
                        <PulseDot color={item.color} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] leading-snug" style={{ color: t.text }}>{item.text}</p>
                    <p className="mt-0.5 text-[9px]" style={{ fontFamily: "monospace", color: t.textLighter }}>{item.time}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="mx-4" style={{ height: "1px", backgroundColor: t.dividerAlt }} />

        {/* ---- Revenue & Insights ---- */}
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={12} style={{ color: t.warningOld }} />
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: t.textLight, fontFamily: "monospace" }}>
              Revenue Insights
            </span>
          </div>
          <div className="space-y-2">
            {/* Revenue KPI */}
            <div className="rounded-lg p-3" style={{ backgroundColor: t.sidebarCardBg, border: `1px solid ${t.sidebarCardBorder}` }}>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ fontFamily: "monospace", color: t.textLabel }}>AI Revenue (30d)</div>
                  <div className="text-[18px] font-bold" style={{ fontFamily: "monospace", color: t.accentOld }}>
                    ${aiRevenue.toLocaleString()}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ fontFamily: "monospace", color: revenueDelta.pct >= 0 ? t.positiveOld : t.accentOld }}>
                    {revenueDelta.label}
                  </div>
                </div>
                {revenueSparkData.length >= 2 && <Sparkline data={revenueSparkData} color={t.accentOld} width={80} height={30} />}
              </div>
            </div>

            {/* Trend alert */}
            {revTrending && (
              <div className="rounded-lg p-3" style={{ backgroundColor: t.sidebarCardBg, border: `1px solid ${t.sidebarCardBorder}` }}>
                <div className="mb-1 flex items-center gap-1.5">
                  {revTrending.direction === "down" ? <TrendingDown size={11} style={{ color: t.accentOld }} /> : <TrendingUp size={11} style={{ color: t.positiveOld }} />}
                  <span className="text-[10px] font-semibold" style={{ color: revTrending.direction === "down" ? t.accentOld : t.positiveOld }}>
                    {revTrending.direction === "down" ? "Revenue Anomaly" : "Revenue Growing"}
                  </span>
                </div>
                <p className="text-[11px] leading-snug mb-2" style={{ color: t.textBody }}>
                  {revTrending.direction === "down" ? "Down" : "Up"} <span className="font-semibold">{Math.abs(revTrending.pct)}%</span> vs 30-day average.
                </p>
                <Link
                  href="/analytics"
                  className="flex items-center gap-1 text-[10px] font-medium"
                  style={{ fontFamily: "monospace", color: revTrending.direction === "down" ? t.accentOld : t.positiveOld }}
                >
                  Investigate <ChevronRight size={10} />
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ---- Conversations ---- */}
        <div className="mx-4" style={{ height: "1px", backgroundColor: t.dividerAlt }} />
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={12} style={{ color: t.accentOld }} />
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: t.textLight, fontFamily: "monospace" }}>
                Conversations
              </span>
            </div>
            <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold" style={{ backgroundColor: t.accentOld, color: "#fff" }}>
              {conversations.length}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {conversations.map((c, i) => (
              <Link
                key={i}
                href="/conversations"
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors"
                style={{ backgroundColor: c.unread ? t.unreadBg : "transparent", border: c.unread ? `1px solid ${t.unreadBorder}` : "1px solid transparent" }}
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold" style={{ backgroundColor: t.accentBgLight, color: t.accentOld }}>
                  {c.name.split(" ").map((w) => w[0]).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[11px] font-medium" style={{ color: t.text }}>{c.name}</span>
                    {c.unread && <PulseDot color={t.accentOld} />}
                    {c.escalated && <AlertTriangle size={9} style={{ color: t.accentOld }} />}
                  </div>
                  <p className="truncate text-[10px]" style={{ color: t.textLabel }}>{c.subject}</p>
                </div>
                <ChevronRight size={10} style={{ color: t.textFaintest }} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
