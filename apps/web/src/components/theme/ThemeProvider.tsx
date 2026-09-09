"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

export type Theme = "light" | "drenched";

export const THEMES: { id: Theme; label: string; hint: string }[] = [
  { id: "light", label: "Light", hint: "Crisp paper, evidence-led colour" },
  { id: "drenched", label: "Drenched", hint: "Cobalt shell, warm-paper workspace" },
];

interface ThemeContextType {
  theme: Theme;
  mounted: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  mounted: false,
  toggleTheme: () => {},
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

// The app keeps its OWN theme key, separate from the landing's palette key
// ('allo-theme'). They are independent on purpose: the landing defaults to
// drenched, the app to light, and the landing's palette never drags the app.
// (This also sidesteps any stale 'allo-theme' value forcing the app to drenched.)
const STORAGE_KEY = "allo-app-theme";
// The APP defaults to LIGHT — it's a working tool and needs maximum legibility.
// (The marketing landing keeps its own drenched/cobalt default via its scoped
// .opt-v2 system; this default only governs the authenticated app shell.)
const DEFAULT_THEME: Theme = "light";

function isTheme(v: string | null): v is Theme {
  return v === "drenched" || v === "light";
}

export function normalizeAppTheme(v: string | null): Theme {
  if (v === "spectrum") return "light";
  if (v === "drenched-paper" || v === "dark") return "drenched";
  return isTheme(v) ? v : DEFAULT_THEME;
}

/**
 * Inline script to prevent a flash of the wrong theme. It sets the active
 * data-theme before paint. The app defaults to Light.
 */
export function ThemeScript() {
  const script = `
(function(){
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var t = stored === 'spectrum' ? 'light'
      : (stored === 'drenched-paper' || stored === 'dark') ? 'drenched'
      : (stored === 'drenched' || stored === 'light') ? stored
      : '${DEFAULT_THEME}';
    var el = document.documentElement;
    el.setAttribute('data-theme', t);
    el.classList.remove('dark');
  } catch(e){}
})();
`;
  // suppressHydrationWarning: this is a pre-paint side-effect script; its text
  // only ever differs server-vs-client during dev fast-refresh (when the source
  // changes under an open tab). Production HTML/JS ship together, so it matches.
  return (
    <script
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);

  // Initialize from localStorage, otherwise the Light default.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setThemeState(normalizeAppTheme(stored));
    setMounted(true);
  }, []);

  // Apply data-theme whenever theme changes. Apply ONLY — do
  // NOT persist here. Persisting the default on mount would pollute the shared
  // 'allo-theme' key (e.g. the app's light default overwriting the landing's
  // drenched). The key holds ONLY an explicit user choice (written below).
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.classList.remove("dark");
  }, [theme, mounted]);

  const persist = (t: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  };

  // Persist only on an explicit choice, so defaults never pollute the key.
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    persist(t);
  }, []);

  // Quick toggle between the two supported application themes.
  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "light" ? "drenched" : "light";
      persist(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, mounted, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
