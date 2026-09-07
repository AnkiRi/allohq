"use client";

import { Moon, Sun, Sunrise } from "lucide-react";
import { useEffect, useState } from "react";

const themes = [
  { id: "drenched", label: "Dawn", Icon: Sunrise },
  { id: "light", label: "Day", Icon: Sun },
  { id: "dark", label: "Night", Icon: Moon },
] as const;
type ThemeId = (typeof themes)[number]["id"];
const storageKey = "allo-theme";

function isTheme(value: string | null): value is ThemeId {
  return value === "drenched" || value === "light" || value === "dark";
}

function resolveTheme(): ThemeId {
  try {
    const queryTheme = new URLSearchParams(window.location.search).get("pal");
    if (isTheme(queryTheme)) return queryTheme;
    const storedTheme = localStorage.getItem(storageKey);
    if (isTheme(storedTheme)) return storedTheme;
  } catch {
    // Storage and query parsing are optional; Dawn remains the safe default.
  }
  return "drenched";
}

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>("drenched");

  useEffect(() => {
    const resolved = resolveTheme();
    setTheme(resolved);
    const root = document.querySelector<HTMLElement>(".main-a2");
    if (root) root.dataset.pal = resolved;
  }, []);

  const choose = (next: ThemeId) => {
    setTheme(next);
    const root = document.querySelector<HTMLElement>(".main-a2");
    if (root) root.dataset.pal = next;
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.classList.toggle("dark", next !== "light");
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // The selected theme still applies for this visit when storage is blocked.
    }
  };

  return (
    <div className="a2-theme-switcher" role="group" aria-label="Choose page theme">
      {themes.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={theme === id ? "is-active" : ""}
          aria-label={`${label} theme`}
          aria-pressed={theme === id}
          title={label}
          onClick={() => choose(id)}
        >
          <Icon aria-hidden="true" strokeWidth={1.75} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
