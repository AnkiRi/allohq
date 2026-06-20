"use client";

import { cn } from "@allohq/ui";

// ---------------------------------------------------------------------------
// OpTag — a bracketed mono chip naming the operator pattern behind a decision.
// Accent-bordered, lowercase. e.g. [memory] [pre-empt] [timing] [win-back].
// ---------------------------------------------------------------------------

export type OpTagKind =
  | "memory"
  | "pre-empt"
  | "timing"
  | "win-back"
  | "welcome"
  | "fatigue"
  | "vip";

export interface OpTagProps {
  kind: OpTagKind;
  className?: string;
}

export function OpTag({ kind, className }: OpTagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono text-[10.5px] lowercase tracking-tight",
        "rounded-md border border-[hsl(var(--accent))]/40 bg-[hsl(var(--accent))]/[0.06]",
        "px-1.5 py-0.5 text-[hsl(var(--accent))] select-none",
        className,
      )}
    >
      [{kind}]
    </span>
  );
}
