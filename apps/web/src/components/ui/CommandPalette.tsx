"use client";

import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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
} from "lucide-react";
import { useAlloAI } from "@/components/ai/AlloAIPanel";

// Context
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

  // Global Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape" && isOpen) {
        close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, toggle, close]);

  return (
    <CommandPaletteContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

// Palette items
const quickActions = [
  { icon: Sparkles, label: "Ask the Agent", hint: "Natural language", action: "ai" as const },
  { icon: Users, label: "Search Customers", hint: "@ to filter", action: "navigate" as const, href: "/customers" },
  { icon: Layers, label: "Jump to Segment", hint: "# to filter", action: "navigate" as const, href: "/segments" },
  { icon: Mail, label: "Create Campaign", hint: "> for commands", action: "navigate" as const, href: "/campaigns" },
  { icon: Target, label: "View Churn Risk Report", hint: "", action: "navigate" as const, href: "/analytics" },
];

const navigationItems = [
  { icon: Sparkles, label: "Home", href: "/dashboard" },
  { icon: Zap, label: "Actions", href: "/actions" },
  { icon: BarChart3, label: "Performance", href: "/analytics" },
  { icon: Users, label: "Customers", href: "/customers" },
  { icon: Layers, label: "Segments", href: "/segments" },
  { icon: FileText, label: "Templates", href: "/templates" },
  { icon: Mail, label: "Campaigns", href: "/campaigns" },
  { icon: Sparkles, label: "Automations", href: "/automations" },
  { icon: MousePointerClick, label: "Forms", href: "/forms" },
  { icon: MessageSquare, label: "Conversations", href: "/conversations" },
  { icon: Brain, label: "Brand Voice", href: "/intelligence/brand" },
  { icon: Store, label: "Integrations", href: "/integrations" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { openPanel, focusInput } = useAlloAI();

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Filter items
  const filteredQuickActions = quickActions.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );
  const filteredNavItems = query
    ? navigationItems.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const allItems = [
    ...filteredQuickActions.map((a) => ({ ...a, type: "action" as const })),
    ...filteredNavItems.map((n) => ({ ...n, type: "nav" as const, action: "navigate" as const, hint: "" })),
  ];

  const executeItem = (index: number) => {
    const item = allItems[index];
    if (!item) return;
    if (item.type === "action" && item.action === "ai") {
      close();
      openPanel();
      setTimeout(() => focusInput(), 100);
    } else if ("href" in item && item.href) {
      close();
      router.push(item.href);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        executeItem(selectedIndex);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, selectedIndex, allItems.length]);

  // Reset selection on query change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm"
            onClick={close}
          />
          <motion.div
            className="relative w-[560px] bg-white rounded-2xl shadow-2xl border border-black/5 overflow-hidden"
            style={{ background: "hsl(var(--card))" }}
            initial={{ scale: 0.95, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                placeholder="Search customers, run actions, ask the agent..."
              />
              <kbd className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                ESC
              </kbd>
            </div>
            <div className="p-2 max-h-[300px] overflow-y-auto">
              {filteredQuickActions.length > 0 && (
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider px-3 py-2">
                  Quick Actions
                </div>
              )}
              {allItems.map((item, i) => (
                <div
                  key={`${item.type}-${item.label}`}
                  onClick={() => executeItem(i)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    selectedIndex === i
                      ? "bg-[#c4704a]/5"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <item.icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm flex-1 text-foreground">{item.label}</span>
                  {item.hint && (
                    <span className="text-[11px] font-mono text-muted-foreground">{item.hint}</span>
                  )}
                </div>
              ))}
              {allItems.length === 0 && query && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No results for &quot;{query}&quot;
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
