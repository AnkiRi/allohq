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

// Track C — the consequence allo COMMITS to before acting. Upside is named, the
// downside/risk is named too (never hidden — naming it is what makes this
// judgment, not hype), and the basis is stated plainly: "estimate" until real
// control data backs it, "calibrated" once it does.
export interface DecisionPrediction {
  upsideRevenue: number;
  liftPct: number;
  downsideRiskPct: number;
  confidence: "low" | "medium" | "high";
  basis: "estimate" | "calibrated";
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
  /** Track C — the predicted consequence allo commits to before acting. */
  prediction?: DecisionPrediction | null;
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
  prediction,
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

      {/* Track C — the predicted consequence allo commits to. Upside, NAMED
          downside, confidence, and the honest basis (estimate vs calibrated). */}
      {prediction && (
        <div className="mt-3 rounded-lg border border-border bg-background/40 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-muted-foreground lowercase">
              predicted consequence
            </span>
            <span
              className={cn(
                "lowercase tracking-tight px-1.5 py-0.5 rounded",
                prediction.basis === "calibrated"
                  ? "text-[hsl(var(--accent))] bg-[hsl(var(--accent))]/10"
                  : "text-muted-foreground border border-border",
              )}
            >
              {prediction.basis === "calibrated"
                ? "calibrated · control-backed"
                : "estimate · not yet control-backed"}
            </span>
          </div>
          <div className="space-y-0.5 text-muted-foreground">
            <div>
              <span className="text-[hsl(var(--accent))]">↗ upside</span>{" "}
              expected recovery{" "}
              <b className="text-foreground">{formatINR(prediction.upsideRevenue)}</b>{" "}
              · ~<b className="text-foreground">{prediction.liftPct}%</b>{" "}
              incremental lift vs control
            </div>
            <div>
              <span className="text-foreground/70">↘ risk</span> ~
              <b className="text-foreground">{prediction.downsideRiskPct}%</b>{" "}
              unsubscribe / annoyance risk
            </div>
            <div>
              <span className="text-muted-foreground">· confidence</span>{" "}
              <b className="text-foreground">{prediction.confidence}</b>
            </div>
          </div>
        </div>
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
