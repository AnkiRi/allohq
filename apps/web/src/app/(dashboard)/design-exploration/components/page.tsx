"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// ---------------------------------------------------------------------------
// Component style definitions
// ---------------------------------------------------------------------------

type ComponentStyle = {
  name: string;
  tag: string;
  btnRadius: string;
  btnShadow: string;
  btnBorder: string;
  cardRadius: string;
  cardBorder: string;
  badgeBold: boolean;
  pros: string;
  cons: string;
};

const STYLES: ComponentStyle[] = [
  {
    name: "Style A: Soft (Current)",
    tag: "Rounded pills, subtle shadows, muted colors — approachable and premium",
    btnRadius: "rounded-full",
    btnShadow: "shadow-sm",
    btnBorder: "",
    cardRadius: "rounded-xl",
    cardBorder: "border border-[#EDE7DB]",
    badgeBold: false,
    pros: "Approachable, premium feel. Friendly and warm. Consistent with current brand.",
    cons: "Can feel too soft for actionable UI. Rounded pills may look casual.",
  },
  {
    name: "Style B: Sharp",
    tag: "Square buttons, crisp borders, clean lines — professional and precise",
    btnRadius: "rounded-md",
    btnShadow: "",
    btnBorder: "border border-[#2C2C2C]/20",
    cardRadius: "rounded-lg",
    cardBorder: "border border-[#2C2C2C]/10",
    badgeBold: false,
    pros: "Professional, clear hierarchy. Good for data-heavy interfaces.",
    cons: "Can feel cold or utilitarian without strong brand personality.",
  },
  {
    name: "Style C: Bold",
    tag: "Large buttons, strong colors, prominent cards — high visual impact",
    btnRadius: "rounded-lg",
    btnShadow: "shadow-md",
    btnBorder: "",
    cardRadius: "rounded-xl",
    cardBorder: "border-2 border-[#EDE7DB]",
    badgeBold: true,
    pros: "High visual impact, clear CTAs. Great for driving action. Bold brand presence.",
    cons: "Can feel heavy or overwhelming with many elements on screen.",
  },
  {
    name: "Style D: Minimal",
    tag: "Ghost buttons, no borders, maximum whitespace — clean and focused",
    btnRadius: "rounded-md",
    btnShadow: "",
    btnBorder: "border border-[#EDE7DB]",
    cardRadius: "rounded-lg",
    cardBorder: "",
    badgeBold: false,
    pros: "Clean, focused, modern. Content speaks for itself. Lots of breathing room.",
    cons: "May lack visual hierarchy. Ghost buttons can be hard to discover.",
  },
];

// ---------------------------------------------------------------------------
// Full-page component preview
// ---------------------------------------------------------------------------

function FullComponentPreview({ style }: { style: ComponentStyle }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-[#EDE7DB] bg-[#FAF6F1] min-h-[600px] p-6 space-y-8">
      {/* Buttons */}
      <div>
        <div className="text-xs font-mono text-[#8B8074] uppercase tracking-wider mb-4">Buttons</div>
        <div className="flex gap-3 flex-wrap items-center">
          <button className={`px-6 py-3 bg-[#C4704D] text-white text-sm font-mono ${style.btnRadius} ${style.btnShadow}`}>
            Primary Action
          </button>
          <button className={`px-6 py-3 bg-white text-[#2C2C2C] text-sm font-mono ${style.btnRadius} ${style.btnBorder || "border border-[#EDE7DB]"}`}>
            Secondary
          </button>
          <button className={`px-6 py-3 bg-[#6B7A2F] text-white text-sm font-mono ${style.btnRadius} ${style.btnShadow}`}>
            Success Action
          </button>
          <button className={`px-6 py-3 text-[#C4704D] text-sm font-mono ${style.btnRadius} ${style.btnBorder || "border border-[#C4704D]/30"}`}>
            Outline
          </button>
          <button className={`px-4 py-2 bg-[#C44A4A] text-white text-xs font-mono ${style.btnRadius}`}>
            Urgent
          </button>
          <button className={`px-4 py-2 bg-[#2C2C2C] text-white text-xs font-mono ${style.btnRadius}`}>
            Dark
          </button>
        </div>
      </div>

      {/* Status Badges */}
      <div>
        <div className="text-xs font-mono text-[#8B8074] uppercase tracking-wider mb-4">Status Badges</div>
        <div className="flex gap-3 flex-wrap">
          <span className={`px-3 py-1 ${style.btnRadius} ${style.badgeBold ? "text-sm font-bold" : "text-xs"} bg-[#6B7A2F]/10 text-[#6B7A2F] font-mono`}>Active</span>
          <span className={`px-3 py-1 ${style.btnRadius} ${style.badgeBold ? "text-sm font-bold" : "text-xs"} bg-[#C4704D]/10 text-[#C4704D] font-mono`}>Draft</span>
          <span className={`px-3 py-1 ${style.btnRadius} ${style.badgeBold ? "text-sm font-bold" : "text-xs"} bg-[#B8963E]/10 text-[#B8963E] font-mono`}>Generating</span>
          <span className={`px-3 py-1 ${style.btnRadius} ${style.badgeBold ? "text-sm font-bold" : "text-xs"} bg-[#C44A4A]/10 text-[#C44A4A] font-mono`}>Error</span>
          <span className={`px-3 py-1 ${style.btnRadius} ${style.badgeBold ? "text-sm font-bold" : "text-xs"} bg-[#8B8074]/10 text-[#8B8074] font-mono`}>Paused</span>
        </div>
      </div>

      {/* Metric Cards */}
      <div>
        <div className="text-xs font-mono text-[#8B8074] uppercase tracking-wider mb-4">Metric Cards</div>
        <div className="grid grid-cols-4 gap-4">
          <div className={`bg-white/60 ${style.cardRadius} ${style.cardBorder} p-5`}>
            <div className="text-[10px] text-[#8B8074] font-mono uppercase">Revenue</div>
            <div className="text-2xl font-bold text-[#6B7A2F] font-mono mt-2">Rs 42,800</div>
            <div className="text-xs text-[#6B7A2F] mt-1">+8% vs last month</div>
          </div>
          <div className={`bg-white/60 ${style.cardRadius} ${style.cardBorder} p-5`}>
            <div className="text-[10px] text-[#8B8074] font-mono uppercase">Customers</div>
            <div className="text-2xl font-bold text-[#2C2C2C] font-mono mt-2">96</div>
            <div className="text-xs text-[#6B7A2F] mt-1">+12 this month</div>
          </div>
          <div className={`bg-white/60 ${style.cardRadius} ${style.cardBorder} p-5`}>
            <div className="text-[10px] text-[#8B8074] font-mono uppercase">Open Rate</div>
            <div className="text-2xl font-bold text-[#B8963E] font-mono mt-2">42%</div>
            <div className="text-xs text-[#8B8074] mt-1">Industry avg: 35%</div>
          </div>
          <div className={`bg-white/60 ${style.cardRadius} ${style.cardBorder} p-5`}>
            <div className="text-[10px] text-[#8B8074] font-mono uppercase">At Risk</div>
            <div className="text-2xl font-bold text-[#C44A4A] font-mono mt-2">51</div>
            <div className="text-xs text-[#C44A4A] mt-1">Rs 84K at risk</div>
          </div>
        </div>
      </div>

      {/* Action Cards */}
      <div>
        <div className="text-xs font-mono text-[#8B8074] uppercase tracking-wider mb-4">Action Cards</div>
        <div className="space-y-3">
          <div className={`bg-white/60 ${style.cardRadius} ${style.cardBorder} p-5`} style={{ borderLeft: "4px solid #C44A4A" }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-mono font-medium text-[#2C2C2C]">51 hibernating customers need attention</div>
                <div className="text-xs text-[#8B8074] mt-1">Rs 84,200 in past revenue at risk — last purchase over 90 days ago</div>
              </div>
              <button className={`px-4 py-2 bg-[#C4704D] text-white text-xs font-mono ${style.btnRadius}`}>
                Launch Win-Back
              </button>
            </div>
          </div>
          <div className={`bg-white/60 ${style.cardRadius} ${style.cardBorder} p-5`} style={{ borderLeft: "4px solid #6B7A2F" }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-mono font-medium text-[#2C2C2C]">3 automations ready for review</div>
                <div className="text-xs text-[#8B8074] mt-1">Welcome Series, Post-Purchase Follow-up, Cart Recovery</div>
              </div>
              <button className={`px-4 py-2 bg-white text-[#2C2C2C] text-xs font-mono ${style.btnRadius} ${style.btnBorder || "border border-[#EDE7DB]"}`}>
                Review & Activate
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Form Elements */}
      <div>
        <div className="text-xs font-mono text-[#8B8074] uppercase tracking-wider mb-4">Form Elements</div>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="text-xs font-mono text-[#8B8074] uppercase mb-1 block">Campaign Name</label>
            <input
              type="text"
              placeholder="e.g. Spring Win-Back"
              className={`w-full px-4 py-2.5 ${style.cardRadius} ${style.cardBorder || "border border-[#EDE7DB]"} bg-white text-sm text-[#2C2C2C] placeholder:text-[#8B8074]/50 outline-none focus:ring-2 focus:ring-[#C4704D]/30`}
            />
          </div>
          <button className={`px-6 py-2.5 bg-[#C4704D] text-white text-sm font-mono ${style.btnRadius} ${style.btnShadow}`}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ComponentsPage() {
  const [active, setActive] = useState(0);
  const style = STYLES[active]!;

  return (
    <div className="max-w-6xl mx-auto py-8">
      <Link
        href="/design-exploration"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 font-mono"
      >
        <ArrowLeft size={14} />
        Back to Design Exploration
      </Link>

      <h1 className="text-2xl font-bold font-mono mb-1">Component Styles</h1>
      <p className="text-sm text-muted-foreground mb-8">
        4 component style systems. Click each tab to see buttons, badges, cards, and forms.
      </p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {STYLES.map((s, i) => (
          <button
            key={s.name}
            onClick={() => setActive(i)}
            className={`px-4 py-2 rounded-lg text-sm font-mono transition-all ${
              active === i
                ? "bg-[#2C2C2C] text-white shadow-lg"
                : "bg-white border border-border text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
        <div className="font-mono text-xs uppercase tracking-wider mb-1 text-amber-700">{style.name}</div>
        <div className="text-xs text-amber-800 mb-2">{style.tag}</div>
        <strong>Pros:</strong> {style.pros}<br />
        <strong>Cons:</strong> {style.cons}
      </div>

      <FullComponentPreview style={style} />
    </div>
  );
}
