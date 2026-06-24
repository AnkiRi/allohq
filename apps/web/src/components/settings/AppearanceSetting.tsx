"use client";

import { Check } from "lucide-react";
import { useTheme, THEMES, type Theme } from "@/components/theme/ThemeProvider";

/**
 * Appearance — the app's theme/colour control. Lives in Settings (not floating
 * in the nav); the choice persists via the ThemeProvider's localStorage. The
 * three palettes are the canonical V2 themes shared with the landing.
 */

// A small, palette-true swatch so the choice reads at a glance (independent of
// the active theme, so all three previews look right whatever you're on).
const SWATCH: Record<Theme, { bg: string; ink: string; accent: string }> = {
  drenched: { bg: "#1f2d80", ink: "#eef1fb", accent: "#e3b24f" },
  light: { bg: "#fafaf9", ink: "#16181c", accent: "#0e7c5a" },
  dark: { bg: "#0b1210", ink: "#e8eee9", accent: "#25b583" },
};

export function AppearanceSetting() {
  const { theme, setTheme, mounted } = useTheme();

  return (
    <div>
      <h2 className="section-header accent-bar-left text-[13px]">Appearance</h2>
      <p className="text-[12px] text-muted-foreground mt-2 mb-4">
        Pick how allo looks. Your choice is saved to this browser.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {THEMES.map((t) => {
          const active = mounted && theme === t.id;
          const sw = SWATCH[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              aria-pressed={active}
              className={`text-left rounded-xl border p-3 transition-colors ${
                active
                  ? "border-primary ring-1 ring-primary/40 bg-primary/5"
                  : "border-border hover:bg-nav-hover"
              }`}
            >
              <div
                className="h-16 rounded-lg flex items-end justify-between p-2 mb-2.5"
                style={{ background: sw.bg, border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <span
                  className="text-[13px] font-semibold leading-none"
                  style={{ color: sw.ink }}
                >
                  allo
                </span>
                <span
                  className="w-3.5 h-3.5 rounded-full"
                  style={{ background: sw.accent }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-foreground">
                  {t.label}
                </span>
                {active && <Check className="w-3.5 h-3.5 text-primary" />}
              </div>
              <span className="block text-[11px] text-muted-foreground mt-0.5">
                {t.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
