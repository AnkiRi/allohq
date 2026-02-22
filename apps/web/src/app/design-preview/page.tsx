"use client";

import { useState } from "react";
import { ModernMinimalist } from "@/components/themes/ModernMinimalist";
import { MinimalElegant } from "@/components/themes/MinimalElegant";
import { CyberpunkGlow } from "@/components/themes/CyberpunkGlow";
import { CyberpunkLite } from "@/components/themes/CyberpunkLite";

const themes = [
  {
    id: "minimalist",
    name: "Modern Minimalist",
    description: "Ultra-clean, inspired by Linear/Vercel",
    component: ModernMinimalist,
  },
  {
    id: "minimal-elegant",
    name: "Minimal Elegant",
    description: "Subtle colors & animations, Sarvam-inspired warmth",
    component: MinimalElegant,
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk Glow",
    description: "Neon elements on a light base",
    component: CyberpunkGlow,
  },
  {
    id: "cyberpunk-lite",
    name: "Cyberpunk Lite",
    description: "Refined dark mode, softer neon aesthetic",
    component: CyberpunkLite,
  },
];

export default function DesignPreviewPage() {
  const [selectedTheme, setSelectedTheme] = useState(themes[0]);
  if (!selectedTheme) return null;
  const ThemeComponent = selectedTheme.component;

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Theme Selector */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-xl border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-white mb-4">
            🎨 Choose Your Design Style
          </h1>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {themes.map((theme) => (
              <button
                key={theme.id}
                onClick={() => setSelectedTheme(theme)}
                className={`flex-shrink-0 px-6 py-3 rounded-lg transition-all ${
                  selectedTheme.id === theme.id
                    ? "bg-purple-600 text-white shadow-lg shadow-purple-500/50"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                <div className="font-semibold">{theme.name}</div>
                <div className="text-xs opacity-75 mt-1">{theme.description}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Theme Preview */}
      <div className="pt-32">
        <ThemeComponent />
      </div>
    </div>
  );
}
