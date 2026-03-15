"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Brain, Sparkles } from "lucide-react";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_BRIEFING = {
  date: "Saturday, March 15",
  summary:
    "Rs 12,400 revenue from 8 orders. 51 customers are hibernating — a win-back campaign could recover significant revenue.",
};

const MOCK_ACTIONS = [
  { level: "urgent" as const, text: "51 hibernating customers", detail: "Rs 84,200 in past revenue at risk", action: "Launch Win-Back" },
  { level: "positive" as const, text: "3 automations ready to go live", detail: "Welcome Series, Post-Purchase, Cart Recovery", action: "Review & Activate" },
];

const MOCK_KPIS = [
  { label: "Customers", value: "96", change: "+12%" },
  { label: "Segments", value: "3" },
  { label: "Campaigns", value: "2", note: "ready to send" },
  { label: "Revenue", value: "Rs 42,800", change: "+8%" },
];

const MOCK_SEGMENTS = [
  { name: "Champions", count: 28, pct: 29, color: "#6B7A2F" },
  { name: "At Risk", count: 17, pct: 18, color: "#C44A4A" },
  { name: "Hibernating", count: 51, pct: 53, color: "#999" },
];

const MOCK_ACTIVITY = [
  { text: "Created Welcome Series automation — now active", time: "2m ago" },
  { text: "Drafted Win-Back Campaign targeting 51 customers", time: "5m ago" },
  { text: "Segmented customer base into 3 groups", time: "8m ago" },
];

// ---------------------------------------------------------------------------
// Theme definitions
// ---------------------------------------------------------------------------

type ThemeDef = {
  name: string;
  tag: string;
  bg: string;
  card: string;
  cardBorder: string;
  accent: string;
  text: string;
  textSecondary: string;
  success: string;
  warning: string;
  urgent: string;
  muted: string;
  pros: string;
  cons: string;
};

const THEMES: ThemeDef[] = [
  {
    name: "Warm Cream (Current)",
    tag: "Current theme — warm, premium, editorial",
    bg: "#FAF6F1",
    card: "rgba(255, 252, 247, 0.85)",
    cardBorder: "rgba(0,0,0,0.06)",
    accent: "#C4704D",
    text: "#2D2A26",
    textSecondary: "#8B7E6A",
    success: "#6B7A2F",
    warning: "#B8963E",
    urgent: "#C44A4A",
    muted: "#EDE7DB",
    pros: "Warm, premium feel. Distinctive brand identity. Works well with serif headings.",
    cons: "May feel too muted for bold brands. Cream can look washed out on some monitors.",
  },
  {
    name: "Clean Slate",
    tag: "Neutral gray — professional, universally readable",
    bg: "#F8F9FA",
    card: "rgba(255, 255, 255, 0.9)",
    cardBorder: "rgba(0,0,0,0.08)",
    accent: "#4A7C59",
    text: "#1A1D21",
    textSecondary: "#6B7280",
    success: "#16A34A",
    warning: "#D97706",
    urgent: "#DC2626",
    muted: "#E5E7EB",
    pros: "Clean, professional, universally readable. High contrast for accessibility.",
    cons: "Less distinctive. Can feel generic without strong brand elements.",
  },
  {
    name: "Midnight Warm",
    tag: "Dark mode — dramatic, modern, high contrast",
    bg: "#1A1815",
    card: "rgba(40, 36, 30, 0.85)",
    cardBorder: "rgba(255,255,255,0.08)",
    accent: "#D4A76A",
    text: "#F5F0E8",
    textSecondary: "#9B8E7E",
    success: "#7C9A3E",
    warning: "#D4A76A",
    urgent: "#E06050",
    muted: "#2A2520",
    pros: "Dramatic, modern, great contrast. Feels premium and immersive.",
    cons: "Dark mode can feel heavy for data-dense dashboards. Harder to read in bright environments.",
  },
  {
    name: "Ocean Minimal",
    tag: "Cool blue — fresh, trustworthy, Stripe-inspired",
    bg: "#F0F4F8",
    card: "rgba(255, 255, 255, 0.85)",
    cardBorder: "rgba(0,0,0,0.06)",
    accent: "#3B82C4",
    text: "#1E293B",
    textSecondary: "#64748B",
    success: "#059669",
    warning: "#F59E0B",
    urgent: "#EF4444",
    muted: "#E2E8F0",
    pros: "Fresh, trustworthy (blue = trust). Clean data presentation.",
    cons: "Less warmth than current. Can feel corporate.",
  },
];

// ---------------------------------------------------------------------------
// Full-page theme preview
// ---------------------------------------------------------------------------

function FullThemePreview({ theme }: { theme: ThemeDef }) {
  return (
    <div
      className="rounded-2xl overflow-hidden border min-h-[700px]"
      style={{ background: theme.bg, borderColor: theme.cardBorder }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: theme.cardBorder }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: theme.accent }}>
            <span className="text-white text-xs font-bold">A</span>
          </div>
          <span style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}>AlloHQ</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: theme.success }} />
          <span style={{ color: theme.textSecondary, fontSize: 11, fontFamily: "monospace" }}>Agent Online</span>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="w-48 border-r p-4 space-y-3 hidden md:block" style={{ borderColor: theme.cardBorder }}>
          {["Home", "Automations", "Customers", "Analytics"].map((item, i) => (
            <div
              key={item}
              className="px-3 py-2 rounded-lg text-xs font-mono"
              style={{
                background: i === 0 ? `${theme.accent}15` : "transparent",
                color: i === 0 ? theme.accent : theme.textSecondary,
                fontWeight: i === 0 ? 600 : 400,
              }}
            >
              {item}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 p-6 space-y-5">
          {/* Briefing card */}
          <div
            className="p-5 rounded-xl backdrop-blur-sm"
            style={{
              background: theme.card,
              borderLeft: `4px solid ${theme.accent}`,
              border: `1px solid ${theme.cardBorder}`,
              borderLeftWidth: 4,
              borderLeftColor: theme.accent,
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Brain size={16} style={{ color: theme.accent }} />
              <span style={{ color: theme.textSecondary, fontSize: 11, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "1px" }}>
                Morning Briefing
              </span>
            </div>
            <div style={{ color: theme.text, fontSize: 18, fontWeight: 700 }}>{MOCK_BRIEFING.date}</div>
            <div style={{ color: theme.textSecondary, fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
              {MOCK_BRIEFING.summary}
            </div>
          </div>

          {/* Action cards */}
          <div className="space-y-3">
            {MOCK_ACTIONS.map((a, i) => (
              <div
                key={i}
                className="p-4 rounded-xl flex items-center gap-4 backdrop-blur-sm"
                style={{
                  background: theme.card,
                  borderLeft: `4px solid ${a.level === "urgent" ? theme.urgent : theme.success}`,
                  border: `1px solid ${theme.cardBorder}`,
                  borderLeftWidth: 4,
                  borderLeftColor: a.level === "urgent" ? theme.urgent : theme.success,
                }}
              >
                <div className="flex-1">
                  <div style={{ color: a.level === "urgent" ? theme.urgent : theme.success, fontSize: 13, fontFamily: "monospace", fontWeight: 600 }}>
                    {a.text}
                  </div>
                  <div style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>{a.detail}</div>
                </div>
                <button
                  className="px-4 py-2 rounded-lg text-white text-xs font-mono whitespace-nowrap"
                  style={{ background: theme.accent }}
                >
                  {a.action}
                </button>
              </div>
            ))}
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-4 gap-3">
            {MOCK_KPIS.map((kpi) => (
              <div
                key={kpi.label}
                className="p-4 rounded-xl backdrop-blur-sm"
                style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
              >
                <div style={{ color: theme.textSecondary, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {kpi.label}
                </div>
                <div style={{ color: theme.text, fontSize: 22, fontWeight: 700, fontFamily: "monospace", marginTop: 4 }}>
                  {kpi.value}
                </div>
                {kpi.change && (
                  <div style={{ color: theme.success, fontSize: 11, marginTop: 2 }}>{kpi.change}</div>
                )}
              </div>
            ))}
          </div>

          {/* Health bar */}
          <div
            className="p-4 rounded-xl backdrop-blur-sm"
            style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
          >
            <div style={{ color: theme.textSecondary, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
              Customer Health
            </div>
            <div className="h-3 rounded-full overflow-hidden flex" style={{ background: theme.muted }}>
              {MOCK_SEGMENTS.map((s) => (
                <div key={s.name} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
              ))}
            </div>
            <div className="flex gap-4 mt-3">
              {MOCK_SEGMENTS.map((s) => (
                <div key={s.name} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span style={{ color: theme.textSecondary, fontSize: 11, fontFamily: "monospace" }}>
                    {s.name} ({s.count})
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Activity feed */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="p-4 rounded-xl backdrop-blur-sm"
              style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
            >
              <div style={{ color: theme.textSecondary, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                Recent Activity
              </div>
              {MOCK_ACTIVITY.map((a, i) => (
                <div key={i} className="flex items-start gap-2 py-2" style={{ borderBottom: i < 2 ? `1px solid ${theme.cardBorder}` : "none" }}>
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: theme.success }} />
                  <div>
                    <div style={{ color: theme.text, fontSize: 12 }}>{a.text}</div>
                    <div style={{ color: theme.textSecondary, fontSize: 10, marginTop: 2 }}>{a.time}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* AI panel mini */}
            <div
              className="p-4 rounded-xl backdrop-blur-sm"
              style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} style={{ color: theme.accent }} />
                <span style={{ color: theme.text, fontSize: 12, fontWeight: 600 }}>Allo AI</span>
                <div className="w-1.5 h-1.5 rounded-full ml-auto" style={{ background: theme.success }} />
              </div>
              <div className="space-y-2">
                <div className="p-3 rounded-lg" style={{ background: `${theme.accent}10` }}>
                  <div style={{ color: theme.text, fontSize: 12, lineHeight: 1.5 }}>
                    Good morning! Revenue is up 8%. I&apos;ve drafted a win-back campaign for 51 hibernating customers.
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <div className="px-2.5 py-1 rounded-full text-xs font-mono" style={{ background: `${theme.accent}15`, color: theme.accent }}>
                    Approve campaign
                  </div>
                  <div className="px-2.5 py-1 rounded-full text-xs font-mono" style={{ background: `${theme.accent}15`, color: theme.accent }}>
                    View details
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ThemesPage() {
  const [active, setActive] = useState(0);
  const theme = THEMES[active]!;

  return (
    <div className="max-w-6xl mx-auto py-8">
      <Link
        href="/design-exploration"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 font-mono"
      >
        <ArrowLeft size={14} />
        Back to Design Exploration
      </Link>

      <h1 className="text-2xl font-bold font-mono mb-1">Color Themes</h1>
      <p className="text-sm text-muted-foreground mb-8">
        The same Home page rendered in 4 different color palettes. Click each tab to view full-page.
      </p>

      {/* Theme tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {THEMES.map((t, i) => (
          <button
            key={t.name}
            onClick={() => setActive(i)}
            className={`px-4 py-2 rounded-lg text-sm font-mono transition-all ${
              active === i
                ? "bg-[#2C2C2C] text-white shadow-lg"
                : "bg-white border border-border text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* Annotation */}
      <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
        <div className="font-mono text-xs uppercase tracking-wider mb-1 text-amber-700">{theme.name}</div>
        <div className="text-xs text-amber-800 mb-2">{theme.tag}</div>
        <strong>Pros:</strong> {theme.pros}<br />
        <strong>Cons:</strong> {theme.cons}
      </div>

      {/* Full-page preview */}
      <FullThemePreview theme={theme} />
    </div>
  );
}
