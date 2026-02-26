"use client";

import { useState, useRef, useEffect } from "react";
import { Code } from "lucide-react";
import { cn } from "@allohq/ui";

// ---------------------------------------------------------------------------
// Available merge tags
// ---------------------------------------------------------------------------

const MERGE_TAGS = [
  { tag: "{{first_name}}", label: "First Name" },
  { tag: "{{last_name}}", label: "Last Name" },
  { tag: "{{email}}", label: "Email" },
  { tag: "{{order.total}}", label: "Order Total" },
  { tag: "{{product.name}}", label: "Product Name" },
  { tag: "{{unsubscribe_url}}", label: "Unsubscribe URL" },
] as const;

// ---------------------------------------------------------------------------
// MergeTagMenu
// ---------------------------------------------------------------------------

interface MergeTagMenuProps {
  onInsert: (tag: string) => void;
}

export function MergeTagMenu({ onInsert }: MergeTagMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={menuRef} className="relative inline-block">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[13px] font-mono transition-colors",
          open
            ? "border-primary/50 bg-muted text-foreground"
            : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border"
        )}
      >
        <Code className="w-3.5 h-3.5" />
        <span>Merge Tags</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-card border border-border rounded-lg shadow-lg py-1">
          {MERGE_TAGS.map(({ tag, label }) => (
            <button
              key={tag}
              onClick={() => {
                onInsert(tag);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted transition-colors"
            >
              <span className="text-[13px] font-mono text-foreground">{label}</span>
              <code className="text-[11px] font-mono text-muted-foreground">{tag}</code>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
