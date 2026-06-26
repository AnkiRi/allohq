"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@allohq/ui";

// ---------------------------------------------------------------------------
// StreamOutput + StreamRow — terminal output lines (tick + mono text).
// Rows stagger in on mount via framer-motion; degrade fully under
// prefers-reduced-motion (no movement, all visible). Content is never gated
// on JS — rows render in the DOM regardless; motion only animates them.
// ---------------------------------------------------------------------------

const EASE = [0.16, 1, 0.3, 1] as const;

export type StreamTick = "ok" | "step" | "hold";

export interface StreamRowProps {
  /** ✓ ok (done) · ▸ step (in progress) · ◦ hold (held back). Default "ok". */
  tick?: StreamTick;
  /** Mono text. May contain <b> emphasis via the `emphasis` children pattern. */
  children: React.ReactNode;
  className?: string;
}

const TICKS: Record<StreamTick, { glyph: string; cls: string }> = {
  ok: { glyph: "✓", cls: "text-[hsl(var(--accent))]" },
  step: { glyph: "▸", cls: "text-[hsl(var(--accent))]" },
  hold: { glyph: "◦", cls: "text-muted-foreground" },
};

const rowVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

export function StreamRow({ tick = "ok", children, className }: StreamRowProps) {
  const reduce = useReducedMotion();
  const t = TICKS[tick];
  return (
    <motion.div
      variants={reduce ? undefined : rowVariants}
      className={cn(
        "flex items-start gap-2.5 font-mono text-[12.5px] leading-relaxed text-muted-foreground",
        className,
      )}
    >
      <span className={cn("select-none mt-px shrink-0", t.cls)} aria-hidden="true">
        {t.glyph}
      </span>
      <span className="min-w-0 [&_b]:font-semibold [&_b]:text-foreground">
        {children}
      </span>
    </motion.div>
  );
}

export interface StreamOutputProps {
  /** Stagger between rows in seconds. Default 0.065 (65ms). */
  stagger?: number;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
}

export function StreamOutput({
  stagger = 0.065,
  className,
  children,
  "aria-label": ariaLabel = "reasoning output",
}: StreamOutputProps) {
  const reduce = useReducedMotion();

  const containerVariants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: reduce ? 0 : stagger },
    },
  };

  return (
    <motion.div
      className={cn("space-y-1.5", className)}
      variants={containerVariants}
      initial={reduce ? false : "hidden"}
      animate="visible"
      aria-label={ariaLabel}
    >
      {children}
    </motion.div>
  );
}
