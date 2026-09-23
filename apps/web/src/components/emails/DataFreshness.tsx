"use client";

import * as React from "react";
import { cn } from "@allohq/ui";

/**
 * How a piece of store data behaves between approval and delivery.
 *
 * Merchants approve an email once and it sends later — sometimes much later.
 * Whether a number is the one they saw, or the one the store holds at send
 * time, changes what they are actually agreeing to. Leaving that implicit is
 * how somebody approves a grid of six products and ships a grid of two.
 */
export type Freshness = "frozen" | "live";

const COPY: Record<Freshness, { label: string; detail: string }> = {
  frozen: {
    label: "Frozen at approval",
    detail: "Captured when you approve, and sent exactly as approved.",
  },
  live: {
    label: "Live at send",
    detail: "Read from Shopify when the email is sent, so it can change after you approve.",
  },
};

export function FreshnessTag({ kind, className }: { kind: Freshness; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        kind === "live"
          ? "border-[#C99116]/40 bg-[#FFF0B8] text-[#6b4d00]"
          : "border-border bg-[#ECE9E1] text-muted-foreground",
        className,
      )}
    >
      <span aria-hidden="true">{kind === "live" ? "◷" : "◆"}</span>
      {COPY[kind].label}
    </span>
  );
}

export function FreshnessNote({ kind }: { kind: Freshness }) {
  return <p className="mt-1.5 text-[11px] text-muted-foreground">{COPY[kind].detail}</p>;
}
