"use client";

import { useEffect, useState } from "react";

/**
 * ThemeToggle — landing-only sun/moon switch.
 *
 * Self-contained and isolated from the app's next-themes `.dark` class: it
 * reads/writes ONLY the `data-allo-theme` attribute on <html> and the
 * `allo-theme` localStorage key. The landing CSS resolves the effective theme
 * from that attribute + the `prefers-color-scheme` media query, so the default
 * (no stored choice) follows the OS with no flash.
 *
 * The attribute is set pre-paint by an inline script in page.tsx; this
 * component just toggles `html[data-allo-theme]` and keeps the button's
 * pressed/label state in sync. All visual token swaps are pure CSS keyed off
 * that attribute + the prefers-color-scheme media query, so there's nothing
 * else to imperatively mutate.
 */
const STORAGE_KEY = "allo-theme";

type Theme = "light" | "dark";

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

/** Resolve the effective theme: explicit override wins, else system. */
function resolveTheme(): Theme {
  const stored = readStored();
  if (stored) return stored;
  return systemPrefersDark() ? "dark" : "light";
}

/** Set the explicit override on <html>; CSS resolves the rest. */
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-allo-theme", theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  // After mount, align the button's icon/label with the resolved theme. We do
  // NOT write the attribute for system-default visitors — leaving it unset lets
  // the CSS media query keep following the OS live (and avoids a needless lock).
  useEffect(() => {
    setTheme(resolveTheme());

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!readStored()) setTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore storage failures (private mode etc.) */
    }
  };

  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      {/* Sun — shown in dark theme (click to go light) */}
      <svg
        className="icon-sun"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M19.4 4.6l-1.7 1.7M6.3 17.7l-1.7 1.7" />
      </svg>
      {/* Moon — shown in light theme (click to go dark) */}
      <svg
        className="icon-moon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5z" />
      </svg>
    </button>
  );
}
