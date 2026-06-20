"use client";

import { cn } from "@allohq/ui";

// ---------------------------------------------------------------------------
// MetricReadout — a mono tabular label + value, for KPIs as console readouts.
// Money uses ₹ + en-IN; AI cost stays USD ($) — pass a preformatted string.
// ---------------------------------------------------------------------------

export function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export interface MetricReadoutProps {
  label: string;
  /** A number is rendered with en-IN grouping; a string is shown verbatim. */
  value: string | number;
  /** When true and value is a number, format as ₹ en-IN currency. */
  money?: boolean;
  /** Optional small accent suffix, e.g. a delta "↗ +28%". */
  accentSuffix?: string;
  /** Show a pulsing live dot before the label. */
  live?: boolean;
  className?: string;
}

export function MetricReadout({
  label,
  value,
  money = false,
  accentSuffix,
  live = false,
  className,
}: MetricReadoutProps) {
  const display =
    typeof value === "number"
      ? money
        ? formatINR(value)
        : value.toLocaleString("en-IN")
      : value;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[12px] whitespace-nowrap",
        className,
      )}
    >
      {live && (
        <span
          aria-hidden="true"
          className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent))] animate-pulse"
        />
      )}
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums text-foreground font-medium">{display}</span>
      {accentSuffix && (
        <span className="tabular-nums text-[hsl(var(--accent))]">
          {accentSuffix}
        </span>
      )}
    </span>
  );
}
