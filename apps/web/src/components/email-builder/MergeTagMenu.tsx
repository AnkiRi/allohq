"use client";

import { useState, useRef, useEffect } from "react";
import { Code } from "lucide-react";
import { cn } from "@allohq/ui";

// ---------------------------------------------------------------------------
// Available merge tags
// ---------------------------------------------------------------------------

const MERGE_TAGS = [
  // Customer
  { tag: "{{first_name}}", label: "First Name", group: "Customer" },
  { tag: "{{last_name}}", label: "Last Name", group: "Customer" },
  { tag: "{{email}}", label: "Email", group: "Customer" },
  // Behavior
  { tag: "{{order_count}}", label: "Order Count", group: "Behavior" },
  { tag: "{{ltv}}", label: "Lifetime Value", group: "Behavior" },
  { tag: "{{avg_order_value}}", label: "Avg Order Value", group: "Behavior" },
  { tag: "{{days_since_purchase}}", label: "Days Since Purchase", group: "Behavior" },
  { tag: "{{last_order_date}}", label: "Last Order Date", group: "Behavior" },
  { tag: "{{segment}}", label: "Customer Segment", group: "Behavior" },
  // Order
  { tag: "{{order.total}}", label: "Order Total", group: "Order" },
  { tag: "{{product.name}}", label: "Product Name", group: "Order" },
  // Utility
  { tag: "{{unsubscribe_url}}", label: "Unsubscribe URL", group: "Utility" },
] as const;

type MergeTag = (typeof MERGE_TAGS)[number];

function groupTags(): [string, MergeTag[]][] {
  const groups: Record<string, MergeTag[]> = {};
  for (const tag of MERGE_TAGS) {
    (groups[tag.group] ??= []).push(tag);
  }
  return Object.entries(groups);
}

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
        <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-card border border-border rounded-lg shadow-lg py-1 max-h-80 overflow-y-auto">
          {groupTags().map(([group, tags]) => (
            <div key={group}>
              <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {group}
              </div>
              {tags.map(({ tag, label }) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
