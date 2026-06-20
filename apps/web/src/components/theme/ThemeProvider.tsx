"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

type Theme = "light" | "dark";

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

const STORAGE_KEY = "allo-theme";

/**
 * Inline script to prevent flash of wrong theme.
 * Rendered as a <script> in the <head> before paint.
 */
export function ThemeScript() {
  const script = `
(function(){
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var theme = stored === 'dark' || stored === 'light' ? stored : null;
    if (!theme) {
      // Terminal default is DARK; light is the opt-in variant.
      theme = 'dark';
    }
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch(e){}
})();
`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Terminal default is DARK; light is the opt-in variant.
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  // Initialize from localStorage, otherwise fall back to the dark default
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "dark" || stored === "light") {
      setThemeState(stored);
    } else {
      setThemeState("dark");
    }
    setMounted(true);
  }, []);

  // Apply class to documentElement whenever theme changes
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, mounted]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, mounted, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
