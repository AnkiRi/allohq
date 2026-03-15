"use client";

import Link from "next/link";

const sections = [
  {
    id: "themes",
    name: "Color Themes",
    desc: "4 complete color palettes applied to the full Home page — Warm Cream, Clean Slate, Midnight Warm, Ocean Minimal.",
    colors: ["#FAF6F1", "#F8F9FA", "#1A1815", "#F0F4F8"],
    href: "/design-exploration/themes",
  },
  {
    id: "ai-panels",
    name: "AI Panel Layouts",
    desc: "3 approaches to AI panel placement — Fixed Right Column, Full-Width Overlay, Center Stage.",
    colors: ["#C4704D", "#6B7A2F", "#2C2C2C", "#EDE7DB"],
    href: "/design-exploration/ai-panels",
  },
  {
    id: "home-layouts",
    name: "Home Page Layouts",
    desc: "4 structural approaches — Narrative Flow, Split View, Card Dashboard, Command Center.",
    colors: ["#FAF6F1", "#C4704D", "#C44A4A", "#6B7A2F"],
    href: "/design-exploration/home-layouts",
  },
  {
    id: "components",
    name: "Component Styles",
    desc: "4 component libraries — Soft, Sharp, Bold, Minimal. Buttons, badges, metric cards, action cards.",
    colors: ["#C4704D", "#6B7A2F", "#B8963E", "#2C2C2C"],
    href: "/design-exploration/components",
  },
  {
    id: "typography",
    name: "Typography",
    desc: "3 font combinations — Sans-Serif Only, Serif Headings, Monospace Accent.",
    colors: ["#2C2C2C", "#5C5549", "#6B7A2F", "#8B8074"],
    href: "/design-exploration/typography",
  },
  {
    id: "chat-styles",
    name: "Chat Styles",
    desc: "3 AI conversation rendering styles — Bubble, Thread, Card Response.",
    colors: ["#C4704D", "#2C2C2C", "#6B7A2F", "#B8963E"],
    href: "/design-exploration/chat-styles",
  },
];

export default function DesignExplorationIndex() {
  return (
    <div className="max-w-2xl mx-auto py-20">
      <h1 className="text-2xl font-bold font-mono mb-2">Design Exploration</h1>
      <p className="text-muted-foreground text-sm mb-10">
        6 design dimensions for AlloHQ — each shown as full-page previews you can compare.
      </p>
      <div className="space-y-4">
        {sections.map((s) => (
          <Link
            key={s.id}
            href={s.href}
            className="block p-6 rounded-xl border border-border hover:border-[#C4704D] transition-all hover:-translate-y-0.5 group"
          >
            <div className="text-lg font-bold font-mono group-hover:text-[#C4704D] transition-colors">
              {s.name}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
            <div className="flex gap-2 mt-3">
              {s.colors.map((color, i) => (
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
