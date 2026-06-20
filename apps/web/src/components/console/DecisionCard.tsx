"use client";

import { cn } from "@allohq/ui";
import { OpTag, type OpTagKind } from "./OpTag";
import { StreamOutput, StreamRow, type StreamTick } from "./StreamOutput";
import { formatINR } from "./MetricReadout";

// ---------------------------------------------------------------------------
// DecisionCard — allo's decision in operator language. A one-line decision
// (sans prose), a short mono reasoning block (what it found / held back /
// drafted), an OpTag, an estimated ₹ impact, and inline Approve / Pass.
// Calm, not busy.
// ---------------------------------------------------------------------------

export interface DecisionReasonLine {
  tick?: StreamTick;
  text: React.ReactNode;
}

export interface DecisionCardProps {
  /** The decision in one sans line, allo's warm voice. */
  decision: React.ReactNode;
  /** Short reasoning, each line a mono StreamRow. */
  reasoning?: DecisionReasonLine[];
  /** Operator pattern tag(s). */
  tags?: OpTagKind[];
  /** Estimated impact in ₹ (en-IN). Omitted if undefined/null. */
  impact?: number | null;
  /** Inline approve / pass. */
  onApprove?: () => void;
  onPass?: () => void;
  /** Disable buttons while a mutation is in flight. */
  busy?: boolean;
  className?: string;
}

export function DecisionCard({
  decision,
  reasoning,
  tags,
  impact,
  onApprove,
  onPass,
  busy = false,
  className,
}: DecisionCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        className,
      )}
    >
      {/* Tags + impact row */}
      {(tags?.length || impact != null) && (
        <div className="flex items-center gap-2 mb-2.5">
          {tags?.map((t) => (
            <OpTag key={t} kind={t} />
          ))}
          {impact != null && impact > 0 && (
            <span className="ml-auto font-mono text-[12px] text-[hsl(var(--accent))] tabular-nums">
              ~{formatINR(impact)}
            </span>
          )}
        </div>
      )}

      {/* Decision — sans prose */}
      <p className="font-sans text-[14px] leading-snug text-foreground">
        {decision}
      </p>

      {/* Reasoning — mono stream */}
      {reasoning && reasoning.length > 0 && (
        <StreamOutput className="mt-3" aria-label="decision reasoning">
          {reasoning.map((r, i) => (
            <StreamRow key={i} tick={r.tick ?? "ok"}>
              {r.text}
            </StreamRow>
          ))}
        </StreamOutput>
      )}

      {/* Inline actions */}
      {(onApprove || onPass) && (
        <div className="flex items-center gap-2 mt-4">
          {onApprove && (
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className={cn(
                "font-mono text-[12px] rounded-lg px-3 py-1.5 transition-colors",
                "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
                "hover:opacity-90 disabled:opacity-50",
              )}
            >
              approve
            </button>
          )}
          {onPass && (
            <button
              type="button"
              onClick={onPass}
              disabled={busy}
              className={cn(
                "font-mono text-[12px] rounded-lg px-3 py-1.5 transition-colors",
                "border border-border text-muted-foreground",
                "hover:bg-muted hover:text-foreground disabled:opacity-50",
              )}
            >
              pass
            </button>
          )}
        </div>
      )}
    </div>
  );
}
