"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Brain, Check } from "lucide-react";

// ---------------------------------------------------------------------------
// Typography definitions
// ---------------------------------------------------------------------------

type TypographyDef = {
  name: string;
  tag: string;
  heading: { family: string; weight: number };
  body: { family: string; weight: number };
  number: { family: string; weight: number };
  label: { family: string; weight: number };
  pros: string;
  cons: string;
};

const TYPES: TypographyDef[] = [
  {
    name: "Type A: Sans-Serif Only (Current)",
    tag: "Inter throughout — clean, universally readable, modern",
    heading: { family: "Inter, system-ui, sans-serif", weight: 700 },
    body: { family: "Inter, system-ui, sans-serif", weight: 400 },
    number: { family: "Inter, system-ui, sans-serif", weight: 700 },
    label: { family: "Inter, system-ui, sans-serif", weight: 500 },
    pros: "Clean, universally readable. Consistent across platforms. No extra font loading.",
    cons: "Less distinctive. Can feel generic without other strong design elements.",
  },
  {
    name: "Type B: Serif Headings",
    tag: "DM Serif Display for headings, DM Sans for body — editorial, premium",
    heading: { family: "'DM Serif Display', Georgia, serif", weight: 400 },
    body: { family: "'DM Sans', Inter, sans-serif", weight: 400 },
    number: { family: "'DM Sans', Inter, sans-serif", weight: 700 },
    label: { family: "'DM Sans', Inter, sans-serif", weight: 500 },
    pros: "Editorial feel, premium. Strong hierarchy. Warm and distinctive.",
    cons: "Serifs can feel traditional. Extra font loading. May clash with modern UI elements.",
  },
  {
    name: "Type C: Monospace Accent",
    tag: "Inter for prose, JetBrains Mono for numbers/labels — data-driven, technical",
    heading: { family: "Inter, system-ui, sans-serif", weight: 700 },
    body: { family: "Inter, system-ui, sans-serif", weight: 400 },
    number: { family: "'JetBrains Mono', monospace", weight: 700 },
    label: { family: "'JetBrains Mono', monospace", weight: 500 },
    pros: "Data-driven feel. Numbers pop. Technical credibility. Labels stand out.",
    cons: "Monospace can feel developer-oriented. May intimidate non-technical users.",
  },
];

const MOCK_SEGMENTS = [
  { name: "Champions", count: 28, pct: 29, color: "#6B7A2F" },
  { name: "At Risk", count: 17, pct: 18, color: "#C44A4A" },
  { name: "Hibernating", count: 51, pct: 53, color: "#999" },
];

// ---------------------------------------------------------------------------
// Full typography preview
// ---------------------------------------------------------------------------

function FullTypographyPreview({ type }: { type: TypographyDef }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-[#EDE7DB] bg-[#FAF6F1] min-h-[600px] p-6 space-y-6">
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;700&display=swap"
        rel="stylesheet"
      />

      {/* Page title */}
      <div style={{ fontFamily: type.heading.family, fontWeight: type.heading.weight, fontSize: 28, color: "#2C2C2C" }}>
        Good morning, Ujjawal
      </div>

      {/* Briefing card */}
      <div className="p-5 rounded-xl bg-white/60 border-l-4 border-l-[#C4704D] border border-[#EDE7DB]">
        <div className="flex items-center gap-2 mb-2">
          <Brain size={14} className="text-[#C4704D]" />
          <span style={{ fontFamily: type.label.family, fontWeight: type.label.weight, fontSize: 10, color: "#C4704D", textTransform: "uppercase", letterSpacing: "1px" }}>
            Morning Briefing
          </span>
        </div>
        <div style={{ fontFamily: type.heading.family, fontWeight: type.heading.weight, fontSize: 20, color: "#2C2C2C" }}>
          Saturday, March 15
        </div>
        <div style={{ fontFamily: type.body.family, fontWeight: type.body.weight, fontSize: 14, color: "#8B8074", marginTop: 8, lineHeight: 1.7 }}>
          Rs 12,400 revenue from 8 orders. 51 customers are hibernating — a win-back campaign targeting these customers could recover significant revenue. Your Welcome Series automation has been performing well with a 42% open rate.
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Revenue", value: "Rs 42,800", change: "+8%", color: "#6B7A2F" },
          { label: "Customers", value: "96", change: "+12%", color: "#2C2C2C" },
          { label: "Open Rate", value: "42%", change: "+5%", color: "#B8963E" },
          { label: "At Risk", value: "51", change: "-3%", color: "#C44A4A" },
        ].map((kpi) => (
          <div key={kpi.label} className="p-4 rounded-xl bg-white/60 border border-[#EDE7DB]">
            <div style={{ fontFamily: type.label.family, fontWeight: type.label.weight, fontSize: 10, color: "#8B8074", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {kpi.label}
            </div>
            <div style={{ fontFamily: type.number.family, fontWeight: type.number.weight, fontSize: 28, color: kpi.color, marginTop: 4 }}>
              {kpi.value}
            </div>
            <div style={{ fontFamily: type.body.family, fontWeight: type.body.weight, fontSize: 12, color: "#6B7A2F", marginTop: 4 }}>
              {kpi.change}
            </div>
          </div>
        ))}
      </div>

      {/* Action card */}
      <div className="p-5 rounded-xl bg-white/60 border border-[#EDE7DB]" style={{ borderLeft: "4px solid #C44A4A" }}>
        <div className="flex items-center justify-between">
          <div>
            <div style={{ fontFamily: type.heading.family, fontWeight: type.heading.weight, fontSize: 16, color: "#2C2C2C" }}>
              51 hibernating customers need attention
            </div>
            <div style={{ fontFamily: type.body.family, fontWeight: type.body.weight, fontSize: 13, color: "#8B8074", marginTop: 4, lineHeight: 1.6 }}>
              Rs 84,200 in past revenue at risk. These customers haven&apos;t purchased in over 90 days. A targeted win-back campaign could recover 15-20% of this revenue.
            </div>
          </div>
          <button
            className="px-5 py-2.5 bg-[#C4704D] text-white rounded-lg whitespace-nowrap ml-4"
            style={{ fontFamily: type.label.family, fontSize: 13, fontWeight: 500 }}
          >
            Launch Win-Back
          </button>
        </div>
      </div>

      {/* Customer health */}
      <div className="p-5 rounded-xl bg-white/60 border border-[#EDE7DB]">
        <div style={{ fontFamily: type.label.family, fontWeight: type.label.weight, fontSize: 10, color: "#8B8074", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
          Customer Health
        </div>
        <div className="h-3 rounded-full overflow-hidden flex bg-[#EDE7DB]">
          {MOCK_SEGMENTS.map((s) => (
            <div key={s.name} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
          ))}
        </div>
        <div className="flex gap-6 mt-3">
          {MOCK_SEGMENTS.map((s) => (
            <div key={s.name} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              <span style={{ fontFamily: type.label.family, fontWeight: type.label.weight, fontSize: 12, color: "#8B8074" }}>
                {s.name}
              </span>
              <span style={{ fontFamily: type.number.family, fontWeight: type.number.weight, fontSize: 14, color: "#2C2C2C" }}>
                {s.count}
              </span>
              <span style={{ fontFamily: type.body.family, fontSize: 11, color: "#8B8074" }}>
                ({s.pct}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Activity feed */}
      <div className="p-5 rounded-xl bg-white/60 border border-[#EDE7DB]">
        <div style={{ fontFamily: type.label.family, fontWeight: type.label.weight, fontSize: 10, color: "#8B8074", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
          Recent Activity
        </div>
        {[
          { text: "Created Welcome Series automation — now active", time: "2m ago" },
          { text: "Drafted Win-Back Campaign targeting 51 customers", time: "5m ago" },
          { text: "Segmented customer base into Champions, At Risk, Hibernating", time: "8m ago" },
        ].map((a, i) => (
          <div key={i} className="flex items-center gap-2 py-3 border-b border-[#EDE7DB]/50 last:border-0">
            <Check size={14} className="text-[#6B7A2F]" />
            <span style={{ fontFamily: type.body.family, fontWeight: type.body.weight, fontSize: 13, color: "#2C2C2C" }}>
              {a.text}
            </span>
            <span style={{ fontFamily: type.label.family, fontSize: 11, color: "#8B8074" }} className="ml-auto">
              {a.time}
            </span>
          </div>
        ))}
      </div>

      {/* Button samples */}
      <div>
        <div style={{ fontFamily: type.label.family, fontWeight: type.label.weight, fontSize: 10, color: "#8B8074", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
          Button Samples
        </div>
        <div className="flex gap-3">
          <button
            className="px-5 py-2.5 bg-[#C4704D] text-white rounded-lg"
            style={{ fontFamily: type.label.family, fontSize: 13, fontWeight: 500 }}
          >
            Primary Action
          </button>
          <button
            className="px-5 py-2.5 bg-white border border-[#EDE7DB] rounded-lg text-[#2C2C2C]"
            style={{ fontFamily: type.label.family, fontSize: 13, fontWeight: 500 }}
          >
            Secondary
          </button>
          <button
            className="px-5 py-2.5 bg-[#6B7A2F] text-white rounded-lg"
            style={{ fontFamily: type.label.family, fontSize: 13, fontWeight: 500 }}
          >
            Approve & Launch
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function TypographyPage() {
  const [active, setActive] = useState(0);
  const type = TYPES[active]!;

  return (
    <div className="max-w-6xl mx-auto py-8">
      <Link
        href="/design-exploration"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 font-mono"
      >
        <ArrowLeft size={14} />
        Back to Design Exploration
      </Link>

      <h1 className="text-2xl font-bold font-mono mb-1">Typography</h1>
      <p className="text-sm text-muted-foreground mb-8">
        3 font combinations applied to a full dashboard page. Click each tab to compare.
      </p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {TYPES.map((t, i) => (
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

      <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
        <div className="font-mono text-xs uppercase tracking-wider mb-1 text-amber-700">{type.name}</div>
        <div className="text-xs text-amber-800 mb-2">{type.tag}</div>
        <strong>Pros:</strong> {type.pros}<br />
        <strong>Cons:</strong> {type.cons}
      </div>

      <FullTypographyPreview type={type} />
    </div>
  );
}
