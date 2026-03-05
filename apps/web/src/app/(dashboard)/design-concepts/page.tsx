"use client";

import Link from "next/link";

const concepts = [
  {
    id: "concept-a",
    name: "Concept A: Refined Warmth",
    desc: "Evolution of current warm cream. Tighter typography, alive data, agent presence, revenue counter.",
    colors: ["#faf8f5", "#c4704a", "#6B7A2F", "#2c2418", "#B8963E"],
    hover: "hover:border-[#c4704a]",
    hoverText: "group-hover:text-[#c4704a]",
    border: "border-border",
  },
  {
    id: "concept-b",
    name: "Concept B: Midnight Studio",
    desc: "Dark-first with electric accents. Stripe-inspired data density, glowing agent indicators.",
    colors: ["#0a0a0f", "#7c3aed", "#06b6d4", "#f8fafc", "#f59e0b"],
    hover: "hover:border-violet-500",
    hoverText: "group-hover:text-violet-500",
    border: "border-border",
  },
  {
    id: "concept-c",
    name: "Concept C: Nordic Minimal",
    desc: "Extreme whitespace, monochrome + one accent. Vercel/Linear-inspired. Content breathes.",
    colors: ["#fafafa", "#171717", "#2563eb", "#737373", "#e5e5e5"],
    hover: "hover:border-gray-900",
    hoverText: "group-hover:text-gray-900",
    border: "border-border",
  },
  {
    id: "concept-d",
    name: "Concept D: Agent-First Dashboard",
    desc: "The AI panel IS the homepage. Conversational dashboard where the agent greets you with morning briefing, inline data cards, and action buttons. Warm cream theme.",
    colors: ["#faf8f5", "#c4704a", "#6B7A2F", "#2c2418", "#B8963E"],
    hover: "hover:border-[#c4704a]",
    hoverText: "group-hover:text-[#c4704a]",
    border: "border-border",
  },
  {
    id: "concept-e",
    name: "Concept E: Split Workspace",
    desc: "Persistent right-side agent panel with live tool execution, conversation threads, and observation feed. Dashboard + Agent always visible side-by-side. Dark theme.",
    colors: ["#0f0f14", "#8b5cf6", "#10b981", "#f8fafc", "#f59e0b"],
    hover: "hover:border-violet-400",
    hoverText: "group-hover:text-violet-400",
    border: "border-border",
  },
  {
    id: "concept-f",
    name: "Concept F: Command Center",
    desc: "Agent as floating overlay + bottom command bar. Minimal dashboard underneath. Agent appears contextually, never blocks the view. Light neutral theme.",
    colors: ["#ffffff", "#111111", "#2563eb", "#6b7280", "#f3f4f6"],
    hover: "hover:border-neutral-900",
    hoverText: "group-hover:text-neutral-900",
    border: "border-border",
  },
];

export default function DesignConceptsIndex() {
  return (
    <div className="max-w-2xl mx-auto py-20">
      <h1 className="text-2xl font-bold font-mono mb-2">Design Concepts</h1>
      <p className="text-muted-foreground text-sm mb-4">
        6 complete theme explorations for AlloHQ.
      </p>
      <div className="flex gap-4 mb-10 text-[11px] font-mono text-muted-foreground">
        <span className="px-2 py-1 rounded bg-muted">A-C: Dashboard themes</span>
        <span className="px-2 py-1 rounded bg-muted">D-F: AI panel placement</span>
      </div>
      <div className="space-y-4">
        {concepts.map((c) => (
          <Link
            key={c.id}
            href={`/design-concepts/${c.id}`}
            className={`block p-6 rounded-xl border ${c.border} ${c.hover} transition-all hover:-translate-y-0.5 group`}
          >
            <div className={`text-lg font-bold font-mono ${c.hoverText} transition-colors`}>
              {c.name}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{c.desc}</p>
            <div className="flex gap-2 mt-3">
              {c.colors.map((color, i) => (
                <span
                  key={i}
                  className="w-6 h-6 rounded-full border border-black/10"
                  style={{ background: color }}
                />
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
