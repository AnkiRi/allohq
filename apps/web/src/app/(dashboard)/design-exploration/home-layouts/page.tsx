"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Brain, Sparkles, Send, Check } from "lucide-react";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_BRIEFING = {
  date: "Saturday, March 15",
  summary: "Rs 12,400 revenue from 8 orders. 51 customers are hibernating — a win-back campaign could recover significant revenue.",
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
// Layout definitions
// ---------------------------------------------------------------------------

type LayoutDef = {
  name: string;
  tag: string;
  pros: string;
  cons: string;
};

const LAYOUTS: LayoutDef[] = [
  {
    name: "Layout A: Narrative Flow (Current)",
    tag: "Full-width briefing hero, action cards below, activity + automations side by side",
    pros: "Story-driven. Easy to scan top priorities. Natural reading flow. AI panel complements the narrative.",
    cons: "Long vertical scroll. Below-fold content gets less attention.",
  },
  {
    name: "Layout B: Split View",
    tag: "Left 60% for briefing + actions, right 40% integrated AI panel — always visible",
    pros: "AI always visible alongside data. No toggle needed. Quick access to both dashboard and AI.",
    cons: "Less space for each section. Can feel cramped on smaller screens.",
  },
  {
    name: "Layout C: Card Dashboard",
    tag: "Grid of equal-sized insight cards. No hero briefing — everything at a glance.",
    pros: "Quick overview of all metrics. Familiar dashboard pattern. Good information density.",
    cons: "Loses narrative flow. Can feel generic. No clear hierarchy of what matters most.",
  },
  {
    name: "Layout D: Command Center",
    tag: "Slim KPI bar top, AI chat as primary interface, actions sidebar",
    pros: "AI is the primary interface. Most innovative. Agent feels like your co-pilot.",
    cons: "Unfamiliar pattern for most users. Requires AI to be excellent. Steep learning curve.",
  },
];

// ---------------------------------------------------------------------------
// Full-page layout previews
// ---------------------------------------------------------------------------

function LayoutAPreview() {
  return (
    <div className="rounded-2xl overflow-hidden border border-[#EDE7DB] bg-[#FAF6F1] min-h-[600px] p-6 space-y-5">
      {/* Hero briefing */}
      <div className="p-5 rounded-xl bg-white/60 border-l-4 border-l-[#C4704D] border border-[#EDE7DB]">
        <div className="flex items-center gap-2 mb-3">
          <Brain size={16} className="text-[#C4704D]" />
          <span className="text-[10px] font-mono text-[#C4704D] uppercase tracking-wider">Morning Briefing</span>
        </div>
        <div className="text-lg font-bold text-[#2C2C2C]">{MOCK_BRIEFING.date}</div>
        <div className="text-sm text-[#8B8074] mt-2 leading-relaxed">{MOCK_BRIEFING.summary}</div>
      </div>

      {/* Action cards */}
      {MOCK_ACTIONS.map((a, i) => (
        <div
          key={i}
          className="p-4 rounded-xl bg-white/60 border border-[#EDE7DB] flex items-center gap-4"
          style={{ borderLeftWidth: 4, borderLeftColor: a.level === "urgent" ? "#C44A4A" : "#6B7A2F" }}
        >
          <div className="flex-1">
            <div className="text-sm font-mono font-medium" style={{ color: a.level === "urgent" ? "#C44A4A" : "#6B7A2F" }}>
              {a.text}
            </div>
            <div className="text-xs text-[#8B8074] mt-1">{a.detail}</div>
          </div>
          <button className="px-4 py-2 bg-[#C4704D] text-white text-xs font-mono rounded-lg">{a.action}</button>
        </div>
      ))}

      {/* KPI + Activity side by side */}
      <div className="grid grid-cols-4 gap-3">
        {MOCK_KPIS.map((kpi) => (
          <div key={kpi.label} className="p-4 rounded-xl bg-white/60 border border-[#EDE7DB] text-center">
            <div className="text-[10px] font-mono text-[#8B8074] uppercase">{kpi.label}</div>
            <div className="text-xl font-bold text-[#2C2C2C] font-mono mt-1">{kpi.value}</div>
            {kpi.change && <div className="text-xs text-[#6B7A2F] mt-1">{kpi.change}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-white/60 border border-[#EDE7DB]">
          <div className="text-[10px] font-mono text-[#8B8074] uppercase mb-3">Recent Activity</div>
          {MOCK_ACTIVITY.map((a, i) => (
            <div key={i} className="flex items-center gap-2 py-2 border-b border-[#EDE7DB]/50 last:border-0">
              <Check size={12} className="text-[#6B7A2F]" />
              <span className="text-xs text-[#2C2C2C]">{a.text}</span>
              <span className="text-[10px] text-[#8B8074]/60 ml-auto">{a.time}</span>
            </div>
          ))}
        </div>
        <div className="p-4 rounded-xl bg-white/60 border border-[#EDE7DB]">
          <div className="text-[10px] font-mono text-[#8B8074] uppercase mb-3">Customer Health</div>
          <div className="h-3 rounded-full overflow-hidden flex bg-[#EDE7DB]">
            {MOCK_SEGMENTS.map((s) => (
              <div key={s.name} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
            ))}
          </div>
          <div className="flex gap-3 mt-3">
            {MOCK_SEGMENTS.map((s) => (
              <div key={s.name} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                <span className="text-[10px] font-mono text-[#8B8074]">{s.name} ({s.count})</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LayoutBPreview() {
  return (
    <div className="rounded-2xl overflow-hidden border border-[#EDE7DB] bg-[#FAF6F1] min-h-[600px]">
      <div className="flex h-[600px]">
        {/* Left: Dashboard */}
        <div className="flex-[6] p-5 space-y-4 border-r border-[#EDE7DB] overflow-y-auto">
          <div className="p-4 rounded-xl bg-white/60 border-l-4 border-l-[#C4704D] border border-[#EDE7DB]">
            <div className="flex items-center gap-1.5 mb-2">
              <Brain size={14} className="text-[#C4704D]" />
              <span className="text-[10px] font-mono text-[#C4704D] uppercase">Briefing</span>
            </div>
            <div className="text-base font-bold text-[#2C2C2C]">{MOCK_BRIEFING.date}</div>
            <div className="text-xs text-[#8B8074] mt-1">{MOCK_BRIEFING.summary}</div>
          </div>

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
              <button className="px-3 py-1.5 bg-[#C4704D] text-white text-[10px] font-mono rounded-lg">{a.action}</button>
            </div>
          ))}

          <div className="grid grid-cols-4 gap-2">
            {MOCK_KPIS.map((kpi) => (
              <div key={kpi.label} className="p-3 rounded-xl bg-white/60 border border-[#EDE7DB] text-center">
                <div className="text-[9px] font-mono text-[#8B8074] uppercase">{kpi.label}</div>
                <div className="text-lg font-bold text-[#2C2C2C] font-mono">{kpi.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: AI Panel */}
        <div className="flex-[4] bg-white/50 p-4 overflow-y-auto">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#EDE7DB]">
            <Sparkles size={14} className="text-[#C4704D]" />
            <span className="text-sm font-bold font-mono text-[#2C2C2C]">Allo AI</span>
            <div className="w-1.5 h-1.5 rounded-full bg-[#6B7A2F] ml-auto" />
          </div>
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-lg bg-[#C4704D]/10 flex items-center justify-center flex-shrink-0">
                <Sparkles size={12} className="text-[#C4704D]" />
              </div>
              <div className="bg-[#FAF6F1] rounded-xl px-3 py-2 text-xs text-[#2C2C2C] leading-relaxed">
                Good morning! Revenue up 8%. I&apos;ve drafted a win-back for 51 hibernating customers.
              </div>
            </div>
            <div className="flex justify-end">
              <div className="bg-[#2C2C2C] text-white rounded-xl px-3 py-2 text-xs">
                Show me the campaign preview
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <div className="px-2 py-1 rounded-full bg-[#C4704D]/10 text-[10px] text-[#C4704D] font-mono">Approve campaign</div>
              <div className="px-2 py-1 rounded-full bg-[#C4704D]/10 text-[10px] text-[#C4704D] font-mono">What else?</div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-[#EDE7DB]/50 border border-[#EDE7DB]">
              <span className="text-[10px] text-[#8B8074]/60 flex-1">Ask Allo anything...</span>
              <Send size={12} className="text-[#C4704D]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LayoutCPreview() {
  return (
    <div className="rounded-2xl overflow-hidden border border-[#EDE7DB] bg-[#FAF6F1] min-h-[600px] p-5">
      <div className="grid grid-cols-3 gap-3">
        {/* Key Insight */}
        <div className="bg-white/60 rounded-xl p-4 border border-[#EDE7DB]">
          <div className="text-[10px] font-mono text-[#C4704D] uppercase mb-2">Key Insight</div>
          <div className="text-sm font-medium text-[#2C2C2C]">51 customers hibernating</div>
          <div className="text-xs text-[#8B8074] mt-1">Rs 84,200 in past revenue at risk</div>
          <button className="mt-3 px-3 py-1.5 bg-[#C4704D] text-white text-[10px] font-mono rounded-lg">Launch Win-Back</button>
        </div>

        {/* Revenue */}
        <div className="bg-white/60 rounded-xl p-4 border border-[#EDE7DB]">
          <div className="text-[10px] font-mono text-[#6B7A2F] uppercase mb-2">Revenue</div>
          <div className="text-2xl font-bold text-[#6B7A2F] font-mono">Rs 42,800</div>
          <div className="text-xs text-[#6B7A2F] mt-1">+8% vs last month</div>
          <div className="text-xs text-[#8B8074] mt-1">8 orders today</div>
        </div>

        {/* Pending */}
        <div className="bg-white/60 rounded-xl p-4 border border-[#EDE7DB]">
          <div className="text-[10px] font-mono text-[#B8963E] uppercase mb-2">Pending Actions</div>
          <div className="text-2xl font-bold text-[#B8963E] font-mono">3</div>
          <div className="text-xs text-[#8B8074] mt-1">actions to review</div>
          <button className="mt-3 px-3 py-1.5 border border-[#EDE7DB] text-[10px] font-mono rounded-lg text-[#5C5549]">Review All</button>
        </div>

        {/* Customers */}
        <div className="bg-white/60 rounded-xl p-4 border border-[#EDE7DB]">
          <div className="text-[10px] font-mono text-[#8B8074] uppercase mb-2">Customers</div>
          <div className="text-2xl font-bold text-[#2C2C2C] font-mono">96</div>
          <div className="text-xs text-[#6B7A2F]">+12 this month</div>
        </div>

        {/* Automations */}
        <div className="bg-white/60 rounded-xl p-4 border border-[#EDE7DB]">
          <div className="text-[10px] font-mono text-[#8B8074] uppercase mb-2">Automations</div>
          <div className="text-sm text-[#2C2C2C]">2 active, 3 ready for review</div>
          <div className="mt-2 flex gap-1">
            <span className="px-2 py-0.5 rounded-full bg-[#6B7A2F]/10 text-[10px] text-[#6B7A2F] font-mono">Active: 2</span>
            <span className="px-2 py-0.5 rounded-full bg-[#B8963E]/10 text-[10px] text-[#B8963E] font-mono">Ready: 3</span>
          </div>
        </div>

        {/* Health */}
        <div className="bg-white/60 rounded-xl p-4 border border-[#EDE7DB]">
          <div className="text-[10px] font-mono text-[#8B8074] uppercase mb-2">Customer Health</div>
          <div className="h-2.5 rounded-full overflow-hidden flex bg-[#EDE7DB] mt-2">
            {MOCK_SEGMENTS.map((s) => (
              <div key={s.name} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            {MOCK_SEGMENTS.map((s) => (
              <span key={s.name} className="text-[9px] font-mono text-[#8B8074]">{s.name}: {s.count}</span>
            ))}
          </div>
        </div>

        {/* Activity - spans 2 columns */}
        <div className="col-span-2 bg-white/60 rounded-xl p-4 border border-[#EDE7DB]">
          <div className="text-[10px] font-mono text-[#8B8074] uppercase mb-3">Recent Activity</div>
          {MOCK_ACTIVITY.map((a, i) => (
            <div key={i} className="flex items-center gap-2 py-2 border-b border-[#EDE7DB]/50 last:border-0">
              <Check size={12} className="text-[#6B7A2F]" />
              <span className="text-xs text-[#2C2C2C]">{a.text}</span>
              <span className="text-[10px] text-[#8B8074]/60 ml-auto">{a.time}</span>
            </div>
          ))}
        </div>

        {/* AI Quick Access */}
        <div className="bg-white/60 rounded-xl p-4 border border-[#EDE7DB]">
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles size={14} className="text-[#C4704D]" />
            <span className="text-xs font-bold text-[#2C2C2C] font-mono">Allo AI</span>
          </div>
          <div className="text-xs text-[#8B8074] mb-3">Quick actions:</div>
          <div className="space-y-1.5">
            <div className="px-2.5 py-1.5 rounded-lg bg-[#C4704D]/10 text-[10px] text-[#C4704D] font-mono cursor-pointer">
              Create a campaign
            </div>
            <div className="px-2.5 py-1.5 rounded-lg bg-[#C4704D]/10 text-[10px] text-[#C4704D] font-mono cursor-pointer">
              Analyze churn risk
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LayoutDPreview() {
  return (
    <div className="rounded-2xl overflow-hidden border border-[#EDE7DB] bg-[#FAF6F1] min-h-[600px]">
      {/* Slim KPI bar */}
      <div className="flex gap-1 px-5 py-3 border-b border-[#EDE7DB] bg-white/40">
        {MOCK_KPIS.map((k) => (
          <div key={k.label} className="flex-1 text-center">
            <span className="text-[9px] text-[#8B8074] font-mono uppercase">{k.label}: </span>
            <span className="text-sm font-bold text-[#2C2C2C] font-mono">{k.value}</span>
            {k.change && <span className="text-[10px] text-[#6B7A2F] ml-1">{k.change}</span>}
          </div>
        ))}
      </div>

      <div className="flex h-[540px]">
        {/* Left: AI Chat (primary) */}
        <div className="flex-1 border-r border-[#EDE7DB] p-5 bg-white/30 overflow-y-auto">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#EDE7DB]">
            <Sparkles size={16} className="text-[#C4704D]" />
            <span className="text-base font-bold text-[#2C2C2C] font-mono">Allo AI</span>
            <div className="w-2 h-2 rounded-full bg-[#6B7A2F] ml-1" />
          </div>
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-lg bg-[#C4704D]/10 flex items-center justify-center flex-shrink-0">
                <Sparkles size={12} className="text-[#C4704D]" />
              </div>
              <div className="bg-[#FAF6F1] rounded-xl px-3 py-2.5 text-xs text-[#2C2C2C] leading-relaxed max-w-[80%]">
                <p className="mb-2">Good morning! Here&apos;s your briefing:</p>
                <div className="p-2 rounded-lg bg-white/60 border border-[#EDE7DB] mb-2">
                  <div className="text-sm font-bold text-[#2C2C2C]">{MOCK_BRIEFING.date}</div>
                  <div className="text-[10px] text-[#8B8074] mt-1">{MOCK_BRIEFING.summary}</div>
                </div>
                <p>I recommend launching the win-back campaign. Shall I draft it?</p>
              </div>
            </div>
            <div className="flex justify-end">
              <div className="bg-[#2C2C2C] text-white rounded-xl px-3 py-2 text-xs">
                Yes, create the win-back campaign
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <div className="px-2.5 py-1 rounded-full bg-[#C4704D]/10 text-[10px] text-[#C4704D] font-mono">Show automations</div>
              <div className="px-2.5 py-1 rounded-full bg-[#C4704D]/10 text-[10px] text-[#C4704D] font-mono">Segment analysis</div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-full bg-[#EDE7DB]/50 border border-[#EDE7DB]">
              <span className="text-xs text-[#8B8074]/60 flex-1">Ask Allo anything...</span>
              <Send size={14} className="text-[#C4704D]" />
            </div>
          </div>
        </div>

        {/* Right: Actions + Activity sidebar */}
        <div className="w-64 p-4 overflow-y-auto">
          <div className="text-[10px] font-mono text-[#8B8074] uppercase mb-3">Needs Attention</div>
          {MOCK_ACTIONS.map((a, i) => (
            <div
              key={i}
              className="p-3 rounded-xl bg-white/60 border border-[#EDE7DB] mb-2"
              style={{ borderLeftWidth: 3, borderLeftColor: a.level === "urgent" ? "#C44A4A" : "#6B7A2F" }}
            >
              <div className="text-xs font-mono font-medium" style={{ color: a.level === "urgent" ? "#C44A4A" : "#6B7A2F" }}>
                {a.text}
              </div>
              <div className="text-[10px] text-[#8B8074] mt-0.5">{a.detail}</div>
              <button className="mt-2 px-2 py-1 bg-[#C4704D] text-white text-[9px] font-mono rounded-md">
                {a.action}
              </button>
            </div>
          ))}

          <div className="text-[10px] font-mono text-[#8B8074] uppercase mt-4 mb-3">Activity</div>
          {MOCK_ACTIVITY.map((a, i) => (
            <div key={i} className="flex items-start gap-2 py-2 border-b border-[#EDE7DB]/50">
              <Check size={10} className="text-[#6B7A2F] mt-0.5" />
              <div>
                <div className="text-[10px] text-[#2C2C2C]">{a.text}</div>
                <div className="text-[9px] text-[#8B8074]/60">{a.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function HomeLayoutsPage() {
  const [active, setActive] = useState(0);
  const layout = LAYOUTS[active]!;

  const previews = [LayoutAPreview, LayoutBPreview, LayoutCPreview, LayoutDPreview];
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

      <h1 className="text-2xl font-bold font-mono mb-1">Home Page Layouts</h1>
      <p className="text-sm text-muted-foreground mb-8">
        4 structural approaches to the Home page. Click each tab to view full-page.
      </p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {LAYOUTS.map((l, i) => (
          <button
            key={l.name}
            onClick={() => setActive(i)}
            className={`px-4 py-2 rounded-lg text-sm font-mono transition-all ${
              active === i
                ? "bg-[#2C2C2C] text-white shadow-lg"
                : "bg-white border border-border text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {l.name}
          </button>
        ))}
      </div>

      <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
        <div className="font-mono text-xs uppercase tracking-wider mb-1 text-amber-700">{layout.name}</div>
        <div className="text-xs text-amber-800 mb-2">{layout.tag}</div>
        <strong>Pros:</strong> {layout.pros}<br />
        <strong>Cons:</strong> {layout.cons}
      </div>

      <ActivePreview />
    </div>
  );
}
