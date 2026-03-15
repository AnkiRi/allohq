"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, Send, Check, Brain } from "lucide-react";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_BRIEFING = {
  date: "Saturday, March 15",
  summary: "Rs 12,400 revenue from 8 orders. 51 customers are hibernating.",
};

const MOCK_KPIS = [
  { label: "Customers", value: "96", change: "+12%" },
  { label: "Revenue", value: "Rs 42,800", change: "+8%" },
  { label: "Campaigns", value: "2" },
  { label: "Segments", value: "3" },
];

const MOCK_ACTIONS = [
  { level: "urgent" as const, text: "51 hibernating customers", detail: "Rs 84,200 at risk", action: "Launch Win-Back" },
  { level: "positive" as const, text: "3 automations ready", detail: "Welcome, Post-Purchase, Cart", action: "Review" },
];

const MOCK_ACTIVITY = [
  { icon: "check" as const, text: "Created Welcome Series — active", time: "2m ago" },
  { icon: "sparkle" as const, text: "Drafted Win-Back Campaign", time: "5m ago" },
];

const MOCK_SEGMENTS = [
  { name: "Champions", pct: 29, color: "#6B7A2F" },
  { name: "At Risk", pct: 18, color: "#C44A4A" },
  { name: "Hibernating", pct: 53, color: "#999" },
];

// ---------------------------------------------------------------------------
// Panel definitions
// ---------------------------------------------------------------------------

type PanelDef = {
  name: string;
  tag: string;
  pros: string;
  cons: string;
};

const PANELS: PanelDef[] = [
  {
    name: "Panel A: Fixed Right Column (Current)",
    tag: "380px fixed right column — always visible alongside dashboard content",
    pros: "Always visible alongside content. Quick interactions without context switching. Familiar pattern.",
    cons: "Limited space for complex responses. Can feel cramped on smaller screens.",
  },
  {
    name: "Panel B: Full-Width Overlay",
    tag: "Slides up from bottom, covers 60% of viewport height",
    pros: "More space for AI responses and previews. Immersive when active. Dashboard still partially visible.",
    cons: "Hides dashboard content. Requires explicit open/close. Extra click to access.",
  },
  {
    name: "Panel C: Center Stage",
    tag: "AI takes center (70% width), dashboard dims behind",
    pros: "AI becomes primary interface. Maximum focus. Great for complex conversations.",
    cons: "Radical departure from dashboard-first UX. Dashboard becomes secondary.",
  },
];

// ---------------------------------------------------------------------------
// Shared dashboard content
// ---------------------------------------------------------------------------

function DashboardContent({ dimmed = false }: { dimmed?: boolean }) {
  return (
    <div className={`p-5 space-y-4 ${dimmed ? "opacity-30" : ""}`}>
      {/* Briefing */}
      <div className="p-4 rounded-xl bg-white/60 border-l-4 border-l-[#C4704D] border border-[#EDE7DB]">
        <div className="flex items-center gap-1.5 mb-2">
          <Brain size={14} className="text-[#C4704D]" />
          <span className="text-[10px] font-mono text-[#8B8074] uppercase tracking-wider">Morning Briefing</span>
        </div>
        <div className="text-base font-bold text-[#2C2C2C]">{MOCK_BRIEFING.date}</div>
        <div className="text-xs text-[#8B8074] mt-1 leading-relaxed">{MOCK_BRIEFING.summary}</div>
      </div>

      {/* Actions */}
      {MOCK_ACTIONS.map((a, i) => (
        <div
          key={i}
          className="p-3 rounded-xl bg-white/60 border border-[#EDE7DB] flex items-center gap-3"
          style={{ borderLeftWidth: 4, borderLeftColor: a.level === "urgent" ? "#C44A4A" : "#6B7A2F" }}
        >
          <div className="flex-1">
            <div className="text-xs font-mono font-medium" style={{ color: a.level === "urgent" ? "#C44A4A" : "#6B7A2F" }}>
              {a.text}
            </div>
            <div className="text-[10px] text-[#8B8074]">{a.detail}</div>
          </div>
          <button className="px-3 py-1.5 bg-[#C4704D] text-white text-[10px] font-mono rounded-lg">
            {a.action}
          </button>
        </div>
      ))}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2">
        {MOCK_KPIS.map((kpi) => (
          <div key={kpi.label} className="p-3 rounded-xl bg-white/60 border border-[#EDE7DB] text-center">
            <div className="text-[9px] font-mono text-[#8B8074] uppercase">{kpi.label}</div>
            <div className="text-lg font-bold text-[#2C2C2C] font-mono">{kpi.value}</div>
            {kpi.change && <div className="text-[10px] text-[#6B7A2F]">{kpi.change}</div>}
          </div>
        ))}
      </div>

      {/* Health */}
      <div className="p-3 rounded-xl bg-white/60 border border-[#EDE7DB]">
        <div className="h-2.5 rounded-full overflow-hidden flex bg-[#EDE7DB]">
          {MOCK_SEGMENTS.map((s) => (
            <div key={s.name} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
          ))}
        </div>
        <div className="flex gap-3 mt-2">
          {MOCK_SEGMENTS.map((s) => (
            <div key={s.name} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
              <span className="text-[10px] font-mono text-[#8B8074]">{s.name} ({s.pct}%)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AIChatContent() {
  return (
    <div className="space-y-3">
      {/* AI message */}
      <div className="flex gap-2">
        <div className="w-6 h-6 rounded-lg bg-[#C4704D]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles size={12} className="text-[#C4704D]" />
        </div>
        <div className="bg-[#FAF6F1] rounded-xl px-3 py-2.5 max-w-[85%] text-xs text-[#2C2C2C] leading-relaxed">
          Good morning! Revenue is up 8% this week. I&apos;ve identified 51 customers at churn risk — a win-back campaign could recover Rs 84,200.
        </div>
      </div>

      {/* User message */}
      <div className="flex justify-end">
        <div className="bg-[#2C2C2C] text-white rounded-xl px-3 py-2.5 max-w-[75%] text-xs">
          Create a win-back campaign for the hibernating segment
        </div>
      </div>

      {/* AI response with data */}
      <div className="flex gap-2">
        <div className="w-6 h-6 rounded-lg bg-[#C4704D]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles size={12} className="text-[#C4704D]" />
        </div>
        <div className="bg-[#FAF6F1] rounded-xl px-3 py-2.5 max-w-[85%] text-xs text-[#2C2C2C] leading-relaxed">
          <p>I&apos;ll create a 3-email win-back sequence:</p>
          <div className="mt-2 p-2 rounded-lg bg-white/60 border border-[#EDE7DB]">
            <div className="text-[10px] font-mono text-[#8B8074] uppercase mb-1">Campaign Preview</div>
            <div className="text-xs font-medium">Win-Back: Hibernating Customers</div>
            <div className="text-[10px] text-[#8B8074] mt-0.5">51 recipients, 3 emails, 7-day sequence</div>
          </div>
          <div className="flex gap-1.5 mt-2">
            <button className="px-2.5 py-1 rounded-lg bg-[#C4704D] text-white text-[10px] font-mono">
              Approve & Launch
            </button>
            <button className="px-2.5 py-1 rounded-lg border border-[#EDE7DB] text-[10px] font-mono text-[#5C5549]">
              Edit first
            </button>
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div className="mt-4 pt-3 border-t border-[#EDE7DB]/50 space-y-2">
        {MOCK_ACTIVITY.map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            {a.icon === "check" ? (
              <Check size={12} className="text-[#6B7A2F]" />
            ) : (
              <Sparkles size={12} className="text-[#B8963E]" />
            )}
            <span className="text-[10px] font-mono text-[#8B8074]">{a.text}</span>
            <span className="text-[9px] text-[#8B8074]/60 ml-auto">{a.time}</span>
          </div>
        ))}
      </div>

      {/* Suggestion pills */}
      <div className="flex gap-1.5 flex-wrap">
        <div className="px-2.5 py-1 rounded-full bg-[#C4704D]/10 border border-[#C4704D]/20 text-[10px] text-[#C4704D] font-mono">
          Show campaign preview
        </div>
        <div className="px-2.5 py-1 rounded-full bg-[#C4704D]/10 border border-[#C4704D]/20 text-[10px] text-[#C4704D] font-mono">
          What should I focus on?
        </div>
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-full bg-[#EDE7DB]/50 border border-[#EDE7DB]">
        <span className="text-xs text-[#8B8074]/60 flex-1">Ask Allo anything...</span>
        <Send size={14} className="text-[#C4704D]" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full-page panel previews
// ---------------------------------------------------------------------------

function PanelAPreview() {
  return (
    <div className="rounded-2xl overflow-hidden border border-[#EDE7DB] bg-[#FAF6F1] min-h-[600px]">
      <div className="flex h-[600px]">
        {/* Dashboard */}
        <div className="flex-1 overflow-y-auto">
          <DashboardContent />
        </div>
        {/* Fixed right panel */}
        <div className="w-[340px] border-l border-[#EDE7DB] bg-white/50 p-4 overflow-y-auto">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#EDE7DB]">
            <div className="w-2 h-2 rounded-full bg-[#6B7A2F]" />
            <span className="text-sm font-bold text-[#2C2C2C] font-mono">Allo AI</span>
            <span className="text-[10px] text-[#8B8074] font-mono ml-auto">Online</span>
          </div>
          <AIChatContent />
        </div>
      </div>
    </div>
  );
}

function PanelBPreview() {
  return (
    <div className="rounded-2xl overflow-hidden border border-[#EDE7DB] bg-[#FAF6F1] min-h-[600px] relative">
      {/* Dashboard behind */}
      <DashboardContent />
      {/* Overlay from bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-[60%] bg-white/95 border-t border-[#EDE7DB] rounded-t-2xl p-5 backdrop-blur-md shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#EDE7DB]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#6B7A2F]" />
            <span className="text-sm font-bold text-[#2C2C2C] font-mono">Allo AI</span>
          </div>
          <div className="flex gap-1.5">
            <div className="px-2.5 py-1 rounded-full bg-[#C4704D]/10 text-[10px] text-[#C4704D] font-mono">Win-back</div>
            <div className="px-2.5 py-1 rounded-full bg-[#EDE7DB] text-[10px] text-[#8B8074] font-mono">Focus areas</div>
          </div>
        </div>
        <AIChatContent />
      </div>
    </div>
  );
}

function PanelCPreview() {
  return (
    <div className="rounded-2xl overflow-hidden border border-[#EDE7DB] bg-[#FAF6F1] min-h-[600px] relative">
      {/* Dimmed dashboard */}
      <DashboardContent dimmed />
      {/* Center AI overlay */}
      <div className="absolute inset-6 bg-white/98 rounded-2xl border border-[#EDE7DB] p-6 backdrop-blur-md shadow-2xl overflow-y-auto">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-6 pb-3 border-b border-[#EDE7DB]">
            <Sparkles size={18} className="text-[#C4704D]" />
            <span className="text-lg font-bold text-[#2C2C2C]">Allo AI</span>
            <div className="w-2 h-2 rounded-full bg-[#6B7A2F] ml-1" />
            <span className="text-[10px] text-[#8B8074] font-mono ml-auto">Press Esc to close</span>
          </div>
          <AIChatContent />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AIPanelsPage() {
  const [active, setActive] = useState(0);
  const panel = PANELS[active]!;

  const previews = [PanelAPreview, PanelBPreview, PanelCPreview];
  const ActivePreview = previews[active]!;

  return (
    <div className="max-w-6xl mx-auto py-8">
      <Link
        href="/design-exploration"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 font-mono"
      >
        <ArrowLeft size={14} />
        Back to Design Exploration
      </Link>

      <h1 className="text-2xl font-bold font-mono mb-1">AI Panel Layouts</h1>
      <p className="text-sm text-muted-foreground mb-8">
        3 approaches to how the AI panel relates to the dashboard. Click each tab to view full-page.
      </p>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {PANELS.map((p, i) => (
          <button
            key={p.name}
            onClick={() => setActive(i)}
            className={`px-4 py-2 rounded-lg text-sm font-mono transition-all ${
              active === i
                ? "bg-[#2C2C2C] text-white shadow-lg"
                : "bg-white border border-border text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Annotation */}
      <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
        <div className="font-mono text-xs uppercase tracking-wider mb-1 text-amber-700">{panel.name}</div>
        <div className="text-xs text-amber-800 mb-2">{panel.tag}</div>
        <strong>Pros:</strong> {panel.pros}<br />
        <strong>Cons:</strong> {panel.cons}
      </div>

      <ActivePreview />
    </div>
  );
}
