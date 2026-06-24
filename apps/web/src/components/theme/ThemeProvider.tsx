"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

export type Theme = "drenched" | "light" | "dark";

/** The two dark palettes keep the `.dark` class so every `dark:` utility works. */
const DARKISH: Theme[] = ["drenched", "dark"];
export const THEMES: { id: Theme; label: string; hint: string }[] = [
  { id: "drenched", label: "Drenched", hint: "Cobalt, allo's signature blue" },
  { id: "light", label: "Light", hint: "Minimal, near-white" },
  { id: "dark", label: "Dark", hint: "Near-black, emerald" },
];

interface ThemeContextType {
  theme: Theme;
  mounted: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "drenched",
  mounted: false,
  toggleTheme: () => {},
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

const STORAGE_KEY = "allo-theme";
const DEFAULT_THEME: Theme = "drenched";

function isTheme(v: string | null): v is Theme {
  return v === "drenched" || v === "light" || v === "dark";
}

/**
 * Inline script to prevent flash of wrong theme. Sets data-theme (and the
 * `.dark` class for the two dark palettes) before paint. Default = drenched.
 */
export function ThemeScript() {
  const script = `
(function(){
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var t = (stored === 'drenched' || stored === 'light' || stored === 'dark') ? stored : '${DEFAULT_THEME}';
    var el = document.documentElement;
    el.setAttribute('data-theme', t);
    if (t === 'drenched' || t === 'dark') { el.classList.add('dark'); }
    else { el.classList.remove('dark'); }
  } catch(e){}
})();
`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);

  // Initialize from localStorage, otherwise the drenched default.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setThemeState(isTheme(stored) ? stored : DEFAULT_THEME);
    setMounted(true);
  }, []);

  // Apply data-theme + `.dark` class whenever theme changes.
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    if (DARKISH.includes(theme)) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, mounted]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  // Cycle drenched → light → dark → drenched (used by any quick toggle).
  const toggleTheme = useCallback(() => {
    setThemeState((prev) =>
      prev === "drenched" ? "light" : prev === "light" ? "dark" : "drenched",
    );
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, mounted, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
