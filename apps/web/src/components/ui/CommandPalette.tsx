"use client";

import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Search,
  Sparkles,
  Users,
  Layers,
  Mail,
  Target,
  BarChart3,
  Settings,
  FileText,
  MessageSquare,
  Store,
  MousePointerClick,
  Brain,
  Zap,
  LayoutDashboard,
  Plus,
  Sun,
  Moon,
  Bell,
  HelpCircle,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { useAlloAI } from "@/components/ai/AlloAIPanel";
import { useTheme } from "@/components/theme/ThemeProvider";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CommandPaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
});

export function useCommandPalette() {
  return useContext(CommandPaletteContext);
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  // Global Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);

  return (
    <CommandPaletteContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Item types
// ---------------------------------------------------------------------------

type CommandCategory = "pages" | "quick-actions" | "ai-commands" | "settings";

interface CommandItem {
  id: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
  category: CommandCategory;
  action: () => void;
}

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  pages: "Pages",
  "quick-actions": "Quick Actions",
  "ai-commands": "AI Commands",
  settings: "Settings",
};

const CATEGORY_ORDER: CommandCategory[] = ["quick-actions", "pages", "ai-commands", "settings"];

// ---------------------------------------------------------------------------
// CommandPalette
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { openPanel, focusInput, setInput: setAIInput } = useAlloAI();
  const { theme, toggleTheme } = useTheme();

  // Build items list
  const allCommandItems: CommandItem[] = buildCommandItems({
    router,
    close,
    openPanel,
    focusInput,
    setAIInput,
    toggleTheme,
    theme,
  });

  // Filter items
  const q = query.toLowerCase().trim();
  const filteredItems = q
    ? allCommandItems.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          (item.hint && item.hint.toLowerCase().includes(q)) ||
          CATEGORY_LABELS[item.category].toLowerCase().includes(q)
      )
    : allCommandItems;

  // Group by category in defined order
  const grouped: { category: CommandCategory; items: CommandItem[] }[] = [];
  for (const cat of CATEGORY_ORDER) {
    const items = filteredItems.filter((i) => i.category === cat);
    if (items.length > 0) {
      grouped.push({ category: cat, items });
    }
  }

  // Flat list for keyboard navigation
  const flatItems = grouped.flatMap((g) => g.items);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Reset selection on query change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector("[data-selected='true']");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const executeItem = useCallback(
    (index: number) => {
      const item = flatItems[index];
      if (!item) return;
      item.action();
    },
    [flatItems]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        executeItem(selectedIndex);
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    },
    [selectedIndex, flatItems.length, executeItem, close]
  );

  // Track flat index across grouped rendering
  let flatIndex = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm"
            onClick={close}
          />

          {/* Modal */}
          <motion.div
            className="relative w-[560px] max-w-[calc(100vw-2rem)] rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden backdrop-blur-xl"
            style={{
              background: "hsl(var(--card) / 0.95)",
            }}
            initial={{ scale: 0.95, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            onKeyDown={handleKeyDown}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
              <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                placeholder="Search pages, actions, AI commands..."
              />
              <kbd className="text-[10px] font-mono text-muted-foreground/70 bg-muted/60 px-1.5 py-0.5 rounded border border-border/30">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[360px] overflow-y-auto p-1.5">
              {grouped.map((group) => {
                const startIndex = flatIndex;
                const renderedItems = group.items.map((item, i) => {
                  const currentFlatIndex = startIndex + i;
                  const isSelected = currentFlatIndex === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      data-selected={isSelected}
                      onClick={() => executeItem(currentFlatIndex)}
                      onMouseEnter={() => setSelectedIndex(currentFlatIndex)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[var(--color-accent)]/8 dark:bg-[var(--color-accent)]/15"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isSelected
                            ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                            : "bg-muted/60 text-muted-foreground"
                        }`}
                      >
                        <item.icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[13px] font-mono flex-1 text-foreground">
                        {item.label}
                      </span>
                      {item.hint && (
                        <span className="text-[10px] font-mono text-muted-foreground/60">
                          {item.hint}
                        </span>
                      )}
                      {isSelected && (
                        <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                      )}
                    </div>
                  );
                });
                flatIndex += group.items.length;
                return (
                  <div key={group.category} className="mb-1">
                    <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider px-3 py-1.5 mt-1">
                      {CATEGORY_LABELS[group.category]}
                    </div>
                    {renderedItems}
                  </div>
                );
              })}

              {flatItems.length === 0 && query && (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground font-mono">
                  No results for &ldquo;{query}&rdquo;
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-4 px-4 py-2 border-t border-border/30 text-[10px] font-mono text-muted-foreground/50">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-muted/60 border border-border/30">&uarr;&darr;</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-muted/60 border border-border/30">&crarr;</kbd>
                select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-muted/60 border border-border/30">esc</kbd>
                close
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Build command items
// ---------------------------------------------------------------------------

function buildCommandItems(deps: {
  router: ReturnType<typeof useRouter>;
  close: () => void;
  openPanel: () => void;
  focusInput: () => void;
  setAIInput: (text: string) => void;
  toggleTheme: () => void;
  theme: string;
}): CommandItem[] {
  const { router, close, openPanel, focusInput, setAIInput, toggleTheme, theme } = deps;

  const navigate = (href: string) => {
    close();
    router.push(href);
  };

  const openAI = (prefill?: string) => {
    close();
    openPanel();
    if (prefill) {
      setTimeout(() => setAIInput(prefill), 150);
    } else {
      setTimeout(() => focusInput(), 100);
    }
  };

  return [
    // -- Pages --
    { id: "page-dashboard", icon: LayoutDashboard, label: "Dashboard", category: "pages", action: () => navigate("/dashboard") },
    { id: "page-campaigns", icon: Mail, label: "Campaigns", category: "pages", action: () => navigate("/campaigns") },
    { id: "page-automations", icon: Sparkles, label: "Automations", category: "pages", action: () => navigate("/automations") },
    { id: "page-templates", icon: FileText, label: "Templates", category: "pages", action: () => navigate("/templates") },
    { id: "page-actions", icon: Zap, label: "Actions", category: "pages", action: () => navigate("/actions") },
    { id: "page-analytics", icon: BarChart3, label: "Analytics", category: "pages", action: () => navigate("/analytics") },
    { id: "page-customers", icon: Users, label: "Customers", category: "pages", action: () => navigate("/customers") },
    { id: "page-segments", icon: Layers, label: "Segments", category: "pages", action: () => navigate("/segments") },
    { id: "page-settings", icon: Settings, label: "Settings", category: "pages", action: () => navigate("/settings") },
    { id: "page-integrations", icon: Store, label: "Integrations", category: "pages", action: () => navigate("/integrations") },
    { id: "page-conversations", icon: MessageSquare, label: "Conversations", category: "pages", action: () => navigate("/conversations") },
    { id: "page-forms", icon: MousePointerClick, label: "Forms", category: "pages", action: () => navigate("/forms") },
    { id: "page-brand-voice", icon: Brain, label: "Brand Voice", category: "pages", action: () => navigate("/intelligence/brand") },

    // -- Quick Actions --
    { id: "action-new-campaign", icon: Plus, label: "New Campaign", hint: "Create", category: "quick-actions", action: () => navigate("/campaigns?new=1") },
    { id: "action-new-template", icon: Plus, label: "New Template", hint: "Create", category: "quick-actions", action: () => navigate("/templates?new=1") },
    { id: "action-new-automation", icon: Plus, label: "New Automation", hint: "Create", category: "quick-actions", action: () => navigate("/automations?new=1") },
    { id: "action-new-segment", icon: Plus, label: "New Segment", hint: "Create", category: "quick-actions", action: () => navigate("/segments?new=1") },
    { id: "action-search-customers", icon: Search, label: "Search Customers", hint: "Find", category: "quick-actions", action: () => navigate("/customers") },
    { id: "action-churn-report", icon: Target, label: "View Churn Risk Report", hint: "Analytics", category: "quick-actions", action: () => navigate("/analytics") },

    // -- AI Commands --
    { id: "ai-ask", icon: Sparkles, label: "Ask AI...", hint: "Open panel", category: "ai-commands", action: () => openAI() },
    { id: "ai-whatif", icon: HelpCircle, label: "What if...", hint: "Scenario", category: "ai-commands", action: () => openAI("What if ") },
    { id: "ai-explain-metrics", icon: TrendingUp, label: "Explain my metrics", hint: "AI insight", category: "ai-commands", action: () => openAI("Explain my key metrics and what they mean for my business") },
    { id: "ai-recommend", icon: Brain, label: "Recommend next action", hint: "AI advice", category: "ai-commands", action: () => openAI("What should I do next to improve retention?") },
    { id: "ai-write-email", icon: Mail, label: "Write an email with AI", hint: "AI draft", category: "ai-commands", action: () => openAI("Write a marketing email for ") },

    // -- Settings --
    {
      id: "settings-dark-mode",
      icon: theme === "dark" ? Sun : Moon,
      label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
      hint: "Theme",
      category: "settings",
      action: () => { close(); toggleTheme(); },
    },
    { id: "settings-notifications", icon: Bell, label: "Notification Preferences", hint: "Settings", category: "settings", action: () => navigate("/settings") },
    { id: "settings-integrations", icon: Store, label: "Manage Integrations", hint: "Settings", category: "settings", action: () => navigate("/integrations") },
  ];
}
