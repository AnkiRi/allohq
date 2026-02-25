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
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-mono transition-colors",
          open
            ? "border-gray-400 bg-gray-50 text-gray-900"
            : "border-gray-200 bg-white text-gray-600 hover:text-gray-900 hover:border-gray-300"
        )}
      >
        <Code className="w-3.5 h-3.5" />
        <span>Merge Tags</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {MERGE_TAGS.map(({ tag, label }) => (
            <button
              key={tag}
              onClick={() => {
                onInsert(tag);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-mono text-gray-700">{label}</span>
              <code className="text-[11px] font-mono text-gray-400">{tag}</code>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
