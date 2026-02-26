"use client";

import { useEffect } from "react";
import { Zap, Bell } from "lucide-react";
import { useAlloAI } from "@/components/ai/AlloAIPanel";

export function TopBar() {
  const { openPanel, focusInput } = useAlloAI();

  // Cmd+K to open panel & focus input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openPanel();
        focusInput();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openPanel, focusInput]);

  return (
    <header className="bg-card border-b border-border">
      <div className="h-14 flex items-center justify-between px-6">
        {/* Command bar trigger — opens AI panel */}
        <button
          onClick={() => {
            openPanel();
            focusInput();
          }}
          className="flex-1 max-w-xl flex items-center gap-3 px-3 py-2 border border-border rounded-lg hover:border-primary/50 transition-all text-left"
        >
          <Zap className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="flex-1 text-[13px] font-mono text-muted-foreground">
            Ask Allo AI anything...
          </span>
          <span className="text-[10px] text-muted-foreground/50 font-mono">⌘K</span>
        </button>

        {/* Actions */}
        <div className="flex items-center gap-3 ml-6">
          <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-secondary rounded-full" />
          </button>
        </div>
      </div>
    </header>
  );
}
